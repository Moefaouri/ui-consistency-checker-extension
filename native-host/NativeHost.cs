using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal static class NativeHost
{
    private const int MaxMessageBytes = 1024 * 1024;
    private const int MaxPromptChars = 240000;
    private static readonly object OutputLock = new object();
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxMessageBytes };
    private static readonly ConcurrentDictionary<string, Process> Running = new ConcurrentDictionary<string, Process>();

    public static void Main()
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        while (true)
        {
            Dictionary<string, object> message;
            try { message = ReadMessage(); }
            catch (Exception error) { Log(error.Message); return; }
            if (message == null) return;
            Handle(message);
        }
    }

    private static void Handle(Dictionary<string, object> message)
    {
        var action = Value(message, "action");
        var provider = Value(message, "provider");
        var requestId = Value(message, "requestId");
        if (provider != "openai" && provider != "anthropic")
        {
            Write(new { ok = false, type = "error", requestId, error = "Only OpenAI Codex and Claude account sessions are supported." });
            return;
        }

        if (action == "login") { OpenBrowserLogin(provider); return; }
        if (action == "status") { SendStatus(provider); return; }
        if (action == "stop") { Stop(requestId); return; }
        if (action == "chat")
        {
            var prompt = Value(message, "prompt");
            var model = Value(message, "model");
            if (string.IsNullOrWhiteSpace(requestId) || string.IsNullOrWhiteSpace(prompt) || prompt.Length > MaxPromptChars || !Regex.IsMatch(model, "^[a-zA-Z0-9._:-]{1,120}$"))
            {
                Write(new { ok = false, type = "error", requestId, error = "The AI request or selected model is invalid." });
                return;
            }
            Task.Run(() => RunChat(provider, requestId, model, prompt));
            return;
        }
        Write(new { ok = false, type = "error", requestId, error = "Unsupported companion action." });
    }

    private static void OpenBrowserLogin(string provider)
    {
        var executable = provider == "openai" ? "codex" : "claude";
        var command = provider == "openai" ? "codex login" : "claude auth login";
        try
        {
            var available = RunCommand("where " + executable, null, 10000, null);
            if (available.ExitCode != 0)
            {
                Write(new { ok = false, error = (provider == "openai" ? "Codex" : "Claude") + " support is not installed. Follow the one-time companion setup guide first." });
                return;
            }
            Process.Start(new ProcessStartInfo("cmd.exe", "/d /s /c \"" + command + " >NUL 2>&1\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
            });
            Write(new { ok = true, message = "Browser sign-in started. Complete the secure provider login, then choose Test connection." });
        }
        catch (Exception error) { Write(new { ok = false, error = "Could not open browser sign-in: " + error.Message }); }
    }

    private static void SendStatus(string provider)
    {
        var command = provider == "openai" ? "codex login status" : "claude auth status";
        try
        {
            var result = RunCommand(command, null, 30000, null);
            var authenticated = result.ExitCode == 0;
            var detail = FirstUsefulLine(result.Output, result.Error);
            Write(new
            {
                ok = true,
                authenticated,
                message = authenticated ? (provider == "openai" ? "Codex account session is ready." : "Claude account session is ready.") :
                    (string.IsNullOrWhiteSpace(detail) ? "No active account session. Open account login first." : detail)
            });
        }
        catch (Exception error) { Write(new { ok = true, authenticated = false, message = FriendlyCommandError(provider, error) }); }
    }

    private static void RunChat(string provider, string requestId, string model, string prompt)
    {
        var command = provider == "openai"
            ? "codex --sandbox read-only --ask-for-approval never exec --model " + model + " --skip-git-repo-check --color never -"
            : "claude -p --model " + model + " --output-format text --permission-mode plan --max-turns 1";
        try
        {
            var result = RunCommand(command, prompt, 180000, process => Running[requestId] = process);
            Process ignored;
            Running.TryRemove(requestId, out ignored);
            if (result.ExitCode != 0)
            {
                Write(new { type = "error", requestId, error = FirstUsefulLine(result.Error, result.Output) });
                return;
            }
            if (!string.IsNullOrWhiteSpace(result.Output)) Write(new { type = "delta", requestId, delta = result.Output.Trim() });
            Write(new { type = "complete", requestId, model });
        }
        catch (Exception error)
        {
            Process ignored;
            Running.TryRemove(requestId, out ignored);
            Write(new { type = "error", requestId, error = FriendlyCommandError(provider, error) });
        }
    }

    private static void Stop(string requestId)
    {
        Process process;
        if (Running.TryRemove(requestId, out process))
        {
            try { if (!process.HasExited) process.Kill(); } catch { }
        }
    }

    private static CommandResult RunCommand(string command, string input, int timeoutMs, Action<Process> started)
    {
        var info = new ProcessStartInfo("cmd.exe", "/d /s /c \"" + command + "\"")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        using (var process = new Process { StartInfo = info })
        {
            process.Start();
            if (started != null) started(process);
            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();
            if (input != null) process.StandardInput.Write(input);
            process.StandardInput.Close();
            if (!process.WaitForExit(timeoutMs))
            {
                try { process.Kill(); } catch { }
                throw new TimeoutException("The local AI command timed out.");
            }
            Task.WaitAll(outputTask, errorTask);
            return new CommandResult { ExitCode = process.ExitCode, Output = outputTask.Result, Error = errorTask.Result };
        }
    }

    private static Dictionary<string, object> ReadMessage()
    {
        var input = Console.OpenStandardInput();
        var lengthBytes = ReadExactly(input, 4);
        if (lengthBytes == null) return null;
        var length = BitConverter.ToInt32(lengthBytes, 0);
        if (length <= 0 || length > MaxMessageBytes) throw new InvalidDataException("Native message size is invalid.");
        var payload = ReadExactly(input, length);
        if (payload == null) throw new EndOfStreamException("Native message ended early.");
        return Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(payload));
    }

    private static byte[] ReadExactly(Stream input, int count)
    {
        var buffer = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var read = input.Read(buffer, offset, count - offset);
            if (read == 0) return offset == 0 ? null : buffer;
            offset += read;
        }
        return buffer;
    }

    private static void Write(object value)
    {
        var payload = Encoding.UTF8.GetBytes(Json.Serialize(value));
        lock (OutputLock)
        {
            var output = Console.OpenStandardOutput();
            var length = BitConverter.GetBytes(payload.Length);
            output.Write(length, 0, length.Length);
            output.Write(payload, 0, payload.Length);
            output.Flush();
        }
    }

    private static string Value(Dictionary<string, object> message, string key)
    {
        object value;
        return message.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : string.Empty;
    }

    private static string FirstUsefulLine(string first, string second)
    {
        var text = !string.IsNullOrWhiteSpace(first) ? first : second;
        if (string.IsNullOrWhiteSpace(text)) return "The local AI command failed.";
        var lines = text.Replace("\r", "").Split('\n');
        return lines[0].Trim();
    }

    private static string FriendlyCommandError(string provider, Exception error)
    {
        if (error is System.ComponentModel.Win32Exception)
            return (provider == "openai" ? "Codex" : "Claude") + " CLI was not found. Install it, then try again.";
        return error.Message;
    }

    private static void Log(string value) { try { Console.Error.WriteLine("[UI Checker companion] " + value); } catch { } }
    private sealed class CommandResult { public int ExitCode; public string Output; public string Error; }
}
