# UI Checker local AI companion

Chrome extensions cannot complete a local CLI OAuth callback or reuse its account session directly. This optional native-messaging companion connects the extension to an already installed Codex or Claude login while keeping the experience browser-based.

## Install on Windows

1. Install the Codex CLI and/or Claude Code using their official instructions.
2. Open `chrome://extensions`, enable Developer mode, and copy this extension's 32-character ID.
3. In PowerShell, from this folder, run:

   ```powershell
   .\install-windows.ps1 -ExtensionId 'your-extension-id'
   ```

4. Reload the extension. In Chat > Settings, select **Browser account login**, then choose **Sign in with browser**.

The companion starts the provider's official OAuth login invisibly and the provider opens its secure website in the default browser. No terminal window is shown. The companion never reads or copies account tokens. It only accepts fixed `login`, `status`, `chat`, and `stop` operations for OpenAI Codex and Claude; arbitrary commands are not accepted.

To remove it, run `uninstall-windows.ps1` from this folder.
