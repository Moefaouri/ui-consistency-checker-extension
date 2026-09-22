$ErrorActionPreference = 'Stop'

$extensionRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profilePath = Join-Path $extensionRoot '.tmp-browser-smoke'
$port = 9444
$process = $null
$socket = $null

function Send-CdpMessage {
  param([int]$Id, [string]$Method, [hashtable]$Params = @{})
  $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $null = $socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  while ($true) {
    $buffer = New-Object byte[] 262144
    $result = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $text = [Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
    $message = $text | ConvertFrom-Json
    if ($message.id -eq $Id) { return $message }
  }
}

try {
  if (-not (Test-Path -LiteralPath $chromePath)) { throw 'Chrome is not installed at the expected path.' }
  $process = Start-Process -FilePath $chromePath -WindowStyle Hidden -PassThru -ArgumentList @(
    '--headless=new', '--disable-gpu', '--no-first-run', "--remote-debugging-port=$port",
    "--user-data-dir=`"$profilePath`"", 'about:blank'
  )
  $targets = $null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $targets = Invoke-RestMethod "http://127.0.0.1:$port/json"; break } catch { Start-Sleep -Milliseconds 200 }
  }
  if (-not $targets) { throw 'Chrome debugging endpoint did not start.' }
  $target = $targets | Where-Object type -eq 'page' | Select-Object -First 1
  $socket = [Net.WebSockets.ClientWebSocket]::new()
  $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  $bootstrap = @'
(() => {
  const now = new Date().toISOString();
  const store = {
    aiProvider: 'openai', aiModels: { openai: 'gpt-6-astra', anthropic: 'claude-sonnet-5', google: 'gemini-3.8-flash' },
    aiContextMode: 'auto', aiIncludeText: true, aiHistoryRetention: 'forever', aiActiveConversationId: 'current',
    aiConversations: [
      { id: 'current', title: 'Current chat', createdAt: now, updatedAt: now, messages: [{ id: 'u1', role: 'user', content: 'Current question', createdAt: now }, { id: 'a1', role: 'assistant', content: 'Current answer', createdAt: now }] },
      { id: 'older', title: 'Older chat', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', messages: [{ id: 'u2', role: 'user', content: 'Older question', createdAt: now }, { id: 'a2', role: 'assistant', content: 'Older answer', createdAt: now }] }
    ], savedComponents: [], theme: 'dark'
  };
  const session = { aiApiKeys: {} };
  const area = data => ({
    async get(keys) { if (!keys) return { ...data }; const list = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.filter(key => key in data).map(key => [key, data[key]])); },
    async set(values) { Object.assign(data, values); },
    async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete data[key]; }
  });
  globalThis.chrome = {
    storage: { local: area(store), session: area(session) },
    runtime: {
      lastError: null, getURL: value => value, onMessage: { addListener() {} },
      sendMessage(message, callback) { const response = message.action === 'aiListModels' ? { success: true, models: ['gpt-6-astra'] } : { success: true }; setTimeout(() => callback?.(response), 0); },
      connect() { throw new Error('Unexpected provider stream during navigation smoke test'); }
    },
    tabs: { async query() { return [{ id: 1, windowId: 1, title: 'Test page', url: 'https://example.test/' }]; }, sendMessage(_id, _message, callback) { callback?.({ success: true }); } },
    scripting: { async executeScript() {} }, sidePanel: { async getLayout() { return { side: 'right' }; } }
  };
  globalThis.__smokeErrors = [];
  addEventListener('error', event => __smokeErrors.push(String(event.error?.stack || event.message)));
  addEventListener('unhandledrejection', event => __smokeErrors.push(String(event.reason?.stack || event.reason)));
})();
'@
  $null = Send-CdpMessage 1 'Page.enable'
  $null = Send-CdpMessage 2 'Page.addScriptToEvaluateOnNewDocument' @{ source = $bootstrap }
  $popupUrl = 'file:///' + ($extensionRoot.Replace('\', '/') -replace ' ', '%20') + '/popup.html'
  $null = Send-CdpMessage 3 'Page.navigate' @{ url = $popupUrl }
  Start-Sleep -Milliseconds 900

  $journey = @'
(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = {};
  const shell = document.getElementById('aiChatShell');
  const settings = document.getElementById('aiSettingsPanel');
  const history = document.getElementById('aiHistoryPanel');
  const input = document.getElementById('aiChatInput');
  result.initial = { chatVisible: !shell.hidden, settingsHidden: settings.hidden, historyHidden: history.hidden, title: document.getElementById('aiConversationTitle').textContent };
  input.value = 'preserved draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('aiSettingsBtn').click(); await wait(20);
  result.settings = { chatHidden: shell.hidden, visible: !settings.hidden, draft: input.value, accordionsInChat: shell.querySelectorAll('.ai-accordion').length };
  document.getElementById('aiSettingsBackBtn').click(); await wait(20);
  result.back = { chatVisible: !shell.hidden, draft: input.value };
  document.getElementById('aiComposer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await wait(20);
  result.missingKey = { noticeVisible: !document.getElementById('aiConfigNotice').hidden, draft: input.value, messages: document.querySelectorAll('.ai-message').length };
  document.getElementById('aiNoticeSettingsBtn').click();
  const key = document.getElementById('aiChatApiKey'); key.value = 'sk-test-12345678901234567890'; key.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('aiTestConnectionBtn').click(); await wait(40);
  result.connection = document.getElementById('aiConnectionStatus').textContent;
  document.getElementById('aiSaveConnectionBtn').click(); await wait(60);
  result.saved = { chatVisible: !shell.hidden, draft: input.value };
  document.getElementById('aiHistoryBtn').click(); await wait(20);
  result.history = { visible: !history.hidden, settingsHidden: settings.hidden, count: document.querySelectorAll('.ai-history-item').length };
  [...document.querySelectorAll('.ai-history-open')].find(button => button.textContent.includes('Older chat')).click(); await wait(30);
  result.older = { chatVisible: !shell.hidden, title: document.getElementById('aiConversationTitle').textContent, text: document.getElementById('aiMessageList').innerText };
  result.design = {
    tabOrder: [...document.querySelectorAll('.tab-navigation .tab-label')].map(node => node.textContent.trim()).join(' > '),
    fontAwesomeLoaded: [...document.fonts].some(font => /Font Awesome/.test(font.family)),
    buttonHasShadow: [...document.querySelectorAll('button')].some(button => getComputedStyle(button).boxShadow !== 'none')
  };
  document.querySelector('[data-theme="light"]').click(); await wait(400);
  document.querySelector('[data-tab="services"]').click(); await wait(30);
  const overflowProbe = document.createElement('div'); overflowProbe.style.height = '900px'; overflowProbe.setAttribute('data-overflow-probe', ''); document.getElementById('servicesTab').appendChild(overflowProbe);
  document.body.scrollTop = document.body.scrollHeight;
  result.layout = {
    htmlTheme: document.documentElement.dataset.theme,
    bodyTheme: document.body.dataset.theme,
    htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    viewportHeight: innerHeight,
    bodyClientHeight: document.body.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
    canReachBottom: Math.ceil(document.body.scrollTop + document.body.clientHeight) >= document.body.scrollHeight
  };
  result.errors = globalThis.__smokeErrors;
  return result;
})()
'@
  $response = Send-CdpMessage 4 'Runtime.evaluate' @{ expression = $journey; awaitPromise = $true; returnByValue = $true }
  if ($response.result.exceptionDetails) { throw $response.result.exceptionDetails.text }
  $result = $response.result.result.value
  if (-not $result.initial.chatVisible -or -not $result.initial.settingsHidden) { throw 'Chat was not the initial screen.' }
  if (-not $result.settings.visible -or -not $result.settings.chatHidden -or $result.settings.accordionsInChat -ne 0) { throw 'Settings are not isolated from chat.' }
  if ($result.back.draft -ne 'preserved draft') { throw 'Draft was lost after leaving Settings.' }
  if (-not $result.missingKey.noticeVisible -or $result.missingKey.draft -ne 'preserved draft') { throw 'Missing-key flow consumed the draft or hid the notice.' }
  if ($result.connection -notmatch 'Connected to OpenAI') { throw 'Connection test did not report success.' }
  if (-not $result.saved.chatVisible -or $result.saved.draft -ne 'preserved draft') { throw 'Saving settings did not restore chat and draft.' }
  if (-not $result.history.visible -or -not $result.history.settingsHidden -or $result.history.count -lt 2) { throw 'History screen was blocked by Settings.' }
  if (-not $result.older.chatVisible -or $result.older.title -ne 'Older chat' -or $result.older.text -notmatch 'Older answer') { throw 'Older conversation did not open correctly.' }
  if ($result.design.tabOrder -ne 'Check > Components > Chat') { throw "Unexpected tab order: $($result.design.tabOrder)" }
  if (-not $result.design.fontAwesomeLoaded) { throw 'The local Font Awesome font did not load.' }
  if ($result.design.buttonHasShadow) { throw 'At least one button still has a box shadow.' }
  if ($result.layout.htmlTheme -ne 'light' -or $result.layout.bodyTheme -ne 'light' -or $result.layout.htmlBackground -ne $result.layout.bodyBackground) { throw "Root and body theme surfaces are not synchronized: $($result.layout | ConvertTo-Json -Compress)" }
  if (-not $result.layout.canReachBottom) { throw 'The overflow container cannot reach its bottom edge.' }
  if ($result.errors.Count -gt 0) { throw "Browser runtime errors: $($result.errors -join ' | ')" }
  $result | ConvertTo-Json -Depth 8
  Write-Output 'PASS browser navigation, draft, connection, history, and runtime-error smoke test'
}
finally {
  if ($socket) { $socket.Dispose() }
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
  $fullProfile = [IO.Path]::GetFullPath($profilePath)
  if (-not $fullProfile.StartsWith($extensionRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe cleanup path: $fullProfile" }
  if (Test-Path -LiteralPath $profilePath) { Remove-Item -LiteralPath $profilePath -Recurse -Force }
}
