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
      { id: 'current', title: 'Current chat', createdAt: now, updatedAt: now, messages: [{ id: 'u1', role: 'user', content: 'Current question', createdAt: now }, { id: 'a1', role: 'assistant', content: ['Try this change.','```preview','{"selector":"#card","mode":"replace","title":"Card"}','```','```html','<article id="card">Card</article>','```','```css','#card { color: blue; }','```','```javascript','document.querySelector("#card").addEventListener("click", () => {});','```'].join('\n'), createdAt: now }] },
      { id: 'older', title: 'Older chat', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', messages: [{ id: 'u2', role: 'user', content: 'Older question', createdAt: now }, { id: 'a2', role: 'assistant', content: 'Older answer', createdAt: now }] }
    ], savedComponents: [], theme: 'dark'
  };
  const session = { aiApiKeys: {} };
  globalThis.__mockWindow = { id: 1, state: 'normal', left: 20, top: 20, width: 1000, height: 800 };
  globalThis.__mockViewport = { width: 500, height: 700 };
  const area = data => ({
    async get(keys) { if (!keys) return { ...data }; const list = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.filter(key => key in data).map(key => [key, data[key]])); },
    async set(values) { Object.assign(data, values); },
    async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete data[key]; }
  });
  globalThis.chrome = {
    storage: { local: area(store), session: area(session) },
    runtime: {
      lastError: null, getURL: value => value, onMessage: { addListener(listener) { (globalThis.__runtimeListeners ||= []).push(listener); } },
      sendMessage(message, callback) {
        let response = { success: true };
        if (message.action === 'aiListModels') response = { success: true, models: ['gpt-6-astra'] };
        else if (message.action === 'responsiveEmulate') { globalThis.__mockViewport = { width: message.width, height: message.height }; response = { success: true, ...globalThis.__mockViewport }; }
        else if (message.action === 'responsiveRestore') { globalThis.__mockViewport = { width: 500, height: 700 }; response = { success: true, restored: true }; }
        setTimeout(() => callback?.(response), 0);
      },
      connect() { throw new Error('Unexpected provider stream during navigation smoke test'); }
    },
    tabs: { async query() { return [{ id: 1, windowId: 1, title: 'Test page', url: 'https://example.test/' }]; }, sendMessage(_id, message, callback) { const response = message.action === 'previewAIFrontend' ? { success: true, parts: message.parts } : message.action === 'getViewportSize' ? { success: true, ...globalThis.__mockViewport } : message.action === 'auditResponsiveLayout' ? { success: true, total: 2, errors: 1, warnings: 1, issues: [{ index: 0, selector: '.wide-card', severity: 'error', message: 'Extends outside the viewport.' }, { index: 1, selector: '.tiny-button', severity: 'warning', message: 'Interactive target is too small.' }] } : { success: true }; callback?.(response); } },
    windows: {
      get(_id, _options, callback) { callback({ ...globalThis.__mockWindow }); },
      update(_id, updateInfo, callback) { Object.assign(globalThis.__mockWindow, updateInfo); callback({ ...globalThis.__mockWindow }); }
    },
    permissions: { request(_permissions, callback) { callback(true); } },
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
  const actionLabels = () => [...document.querySelectorAll('[data-message-id="a1"] .ai-message-action')].map(button => button.textContent);
  result.frontend = { initial: actionLabels() };
  const applyCssAction = [...document.querySelectorAll('[data-message-id="a1"] .ai-message-action')].find(button => button.textContent === 'Apply CSS');
  if (!applyCssAction) throw new Error(`Missing Apply CSS action: ${actionLabels().join(', ')}`);
  applyCssAction.click(); await wait(30);
  result.frontend.afterApply = actionLabels();
  const undoAllAction = [...document.querySelectorAll('[data-message-id="a1"] .ai-message-action')].find(button => button.textContent === 'Undo all');
  if (!undoAllAction) throw new Error(`Missing Undo all action: ${actionLabels().join(', ')}`);
  undoAllAction.click(); await wait(30);
  result.frontend.afterUndo = actionLabels();
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
  const originalWindow = { ...globalThis.__mockWindow };
  document.querySelector('[data-responsive-width="390"]').click(); await wait(500);
  result.responsive = { windowDuringTest: { ...globalThis.__mockWindow }, viewport: { ...globalThis.__mockViewport }, status: document.getElementById('responsiveStatus').textContent, issues: document.querySelectorAll('.responsive-issue').length };
  document.querySelector('[data-responsive-restore="true"]').click(); await wait(40);
  result.responsive.restoredWindow = { ...globalThis.__mockWindow };
  result.responsive.restoredViewport = { ...globalThis.__mockViewport };
  result.responsive.restoreStatus = document.getElementById('responsiveStatus').textContent;
  result.responsive.original = originalWindow;
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

  $fixtureUrl = 'file:///' + ((Join-Path $extensionRoot 'tests\fixtures\content-preview.html').Replace('\', '/') -replace ' ', '%20')
  $null = Send-CdpMessage 5 'Page.navigate' @{ url = $fixtureUrl }
  Start-Sleep -Milliseconds 450
  $contentResponse = Send-CdpMessage 6 'Runtime.evaluate' @{ expression = 'runContentPreviewSmoke()'; awaitPromise = $true; returnByValue = $true }
  if ($contentResponse.result.exceptionDetails) { throw $contentResponse.result.exceptionDetails.text }
  $contentResult = $contentResponse.result.result.value

  if (-not $result.initial.chatVisible -or -not $result.initial.settingsHidden) { throw 'Chat was not the initial screen.' }
  if (($result.frontend.initial -join '|') -notmatch 'Apply HTML.*Apply CSS.*Copy JS.*Apply all.*Undo all') { throw 'Frontend bundle actions were not rendered.' }
  if (($result.frontend.initial -join '|') -match 'Run JS|Apply JS') { throw 'AI-generated JavaScript exposed an execution action.' }
  if (($result.frontend.afterApply -join '|') -notmatch 'Undo CSS') { throw 'Applying CSS did not expose its Undo action.' }
  if (($result.frontend.afterUndo -join '|') -notmatch 'Apply CSS') { throw 'Undo all did not reset frontend actions.' }
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
  if ([int]$result.responsive.viewport.width -ne 390 -or [int]$result.responsive.viewport.height -ne 844 -or $result.responsive.status -notmatch 'Mobile: 390' -or [int]$result.responsive.issues -ne 2) { throw "Responsive preset did not emulate and audit the requested content viewport: $($result.responsive | ConvertTo-Json -Compress)" }
  if ([int]$result.responsive.windowDuringTest.width -ne [int]$result.responsive.original.width -or [int]$result.responsive.windowDuringTest.height -ne [int]$result.responsive.original.height) { throw 'Responsive testing changed the browser window.' }
  if ([int]$result.responsive.restoredViewport.width -ne 500 -or [int]$result.responsive.restoredViewport.height -ne 700 -or $result.responsive.restoreStatus -notmatch 'restored') { throw 'Responsive Restore did not recover the normal content viewport.' }
  if ($result.layout.htmlTheme -ne 'light' -or $result.layout.bodyTheme -ne 'light' -or $result.layout.htmlBackground -ne $result.layout.bodyBackground) { throw "Root and body theme surfaces are not synchronized: $($result.layout | ConvertTo-Json -Compress)" }
  if (-not $result.layout.canReachBottom) { throw 'The overflow container cannot reach its bottom edge.' }
  if ($result.errors.Count -gt 0) { throw "Browser runtime errors: $($result.errors -join ' | ')" }
  if (-not $contentResult.selection -or $contentResult.selection.selector -match 'ui-checker' -or $contentResult.pickerClassPresent) { throw "The element picker returned a temporary selector: $($contentResult | ConvertTo-Json -Compress -Depth 6)" }
  if (-not $contentResult.cssApply.success -or $contentResult.applied.color -ne 'rgb(255, 0, 0)' -or $contentResult.applied.width -ne '200px') { throw "CSS preview did not visibly override the selected element: $($contentResult | ConvertTo-Json -Compress -Depth 6)" }
  if ($contentResult.restored.color -ne $contentResult.original.color -or $contentResult.restored.width -ne $contentResult.original.width) { throw 'CSS Undo did not restore the selected element.' }
  if (-not $contentResult.htmlApplied.success -or -not $contentResult.htmlApplied.selectedPreviewGenerated -or -not $contentResult.htmlApplied.isLiveNode -or $contentResult.htmlApplied.button -ne 'Primary action' -or $contentResult.htmlApplied.color -ne 'rgb(255, 0, 0)' -or $contentResult.htmlApplied.iframe) { throw "HTML and CSS were not applied directly to the live component: $($contentResult | ConvertTo-Json -Compress -Depth 6)" }
  if (-not $contentResult.followupApplied.success -or -not $contentResult.followupApplied.htmlPreserved -or $contentResult.followupApplied.color -ne 'rgb(0, 0, 255)' -or $contentResult.followupApplied.radius -ne '12px') { throw "A CSS-only follow-up lost or failed to style the generated element: $($contentResult | ConvertTo-Json -Compress -Depth 6)" }
  if (-not $contentResult.htmlRestored.sameNode -or $contentResult.htmlRestored.text -ne 'Original stepper') { throw 'HTML Undo did not restore the exact original DOM node.' }
  if ($contentResult.blockedJs.success -or $contentResult.jsExecuted) { throw 'AI-generated JavaScript was not blocked from execution.' }
  if ($contentResult.bodyTheme.dataTheme -ne 'dark' -or $contentResult.bodyToken -ne '#00538e') { throw "Body-scoped theme context was not captured: $($contentResult | ConvertTo-Json -Compress -Depth 6)" }
  if (-not $contentResult.responsiveAudit.success -or [int]$contentResult.responsiveAudit.total -lt 2 -or $contentResult.responsiveAudit.types -notmatch 'viewport-overflow' -or $contentResult.responsiveAudit.types -notmatch 'small-target' -or -not $contentResult.responsiveAudit.ignoredScrollableAndOffscreen -or [int]$contentResult.responsiveAudit.markers -lt 2 -or -not $contentResult.responsiveAudit.cleared) { throw "Responsive issue highlighting failed: $($contentResult | ConvertTo-Json -Compress -Depth 6)" }
  $result | ConvertTo-Json -Depth 8
  $contentResult | ConvertTo-Json -Depth 8
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
