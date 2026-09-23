using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace ApiHubDesktop
{
    static class Program
    {
        internal const string Url = "http://127.0.0.1:4310";

        [STAThread]
        static int Main(string[] args)
        {
            string baseDirectory = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            string root = File.Exists(Path.Combine(baseDirectory, "server.js"))
                ? baseDirectory
                : Directory.GetParent(baseDirectory).FullName;
            if (!File.Exists(Path.Combine(root, "server.js")))
            {
                MessageBox.Show("API Hub server files were not found beside the launcher or in its parent folder.", "API Hub", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 2;
            }

            if (args.Length > 0 && args[0] == "--verify") return VerifyLifecycle(root);

            bool createdNew;
            using (var mutex = new Mutex(true, "Local\\ApiHubDesktopLauncher", out createdNew))
            {
                if (!createdNew)
                {
                    OpenBrowser();
                    return 0;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayContext(root));
            }
            return 0;
        }

        internal static bool IsHealthy()
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(Url + "/api/health");
                request.Method = "GET";
                request.Timeout = 800;
                using (var response = (HttpWebResponse)request.GetResponse()) return response.StatusCode == HttpStatusCode.OK;
            }
            catch { return false; }
        }

        internal static string NewToken()
        {
            var bytes = new byte[32];
            using (var random = RandomNumberGenerator.Create()) random.GetBytes(bytes);
            return Convert.ToBase64String(bytes);
        }

        internal static Process StartServer(string root, string token)
        {
            string bundledNode = Path.Combine(root, "runtime", "node.exe");
            string node = File.Exists(bundledNode) ? bundledNode : "node.exe";
            var info = new ProcessStartInfo(node, "\"server.js\"");
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.EnvironmentVariables["API_HUB_LAUNCHER_TOKEN"] = token;
            info.EnvironmentVariables["PORT"] = "4310";
            var process = Process.Start(info);
            process.EnableRaisingEvents = true;
            return process;
        }

        internal static bool RequestShutdown(string token)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(Url + "/internal/launcher/shutdown");
                request.Method = "POST";
                request.Timeout = 1500;
                request.ContentLength = 0;
                request.Headers["x-api-hub-launcher-token"] = token;
                using (var response = (HttpWebResponse)request.GetResponse()) return response.StatusCode == HttpStatusCode.OK;
            }
            catch { return false; }
        }

        internal static void OpenBrowser()
        {
            try { Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true }); }
            catch { Process.Start("explorer.exe", Url); }
        }

        static int VerifyLifecycle(string root)
        {
            if (IsHealthy()) return 3;
            string token = NewToken();
            Process child = StartServer(root, token);
            bool started = false;
            for (int index = 0; index < 50; index++)
            {
                if (IsHealthy()) { started = true; break; }
                if (child.HasExited) break;
                Thread.Sleep(200);
            }
            if (!started) { if (!child.HasExited) child.Kill(); return 4; }
            if (!RequestShutdown(token)) { if (!child.HasExited) child.Kill(); return 5; }
            if (!child.WaitForExit(5000)) { child.Kill(); return 6; }
            return IsHealthy() ? 7 : 0;
        }
    }

    sealed class TrayContext : ApplicationContext
    {
        readonly string root;
        readonly NotifyIcon tray;
        readonly System.Windows.Forms.Timer timer;
        Process child;
        string launcherToken;
        bool ownsServer;
        int attempts;

        internal TrayContext(string projectRoot)
        {
            root = projectRoot;
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open API Hub", null, delegate { Program.OpenBrowser(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Stop and exit", null, delegate { StopAndExit(); });
            tray = new NotifyIcon();
            tray.Icon = SystemIcons.Shield;
            tray.Text = "API Hub";
            tray.Visible = true;
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { Program.OpenBrowser(); };

            timer = new System.Windows.Forms.Timer();
            timer.Interval = 250;
            timer.Tick += PollHealth;

            if (Program.IsHealthy())
            {
                tray.ShowBalloonTip(2500, "API Hub", "Already running. Opening the control plane.", ToolTipIcon.Info);
                Program.OpenBrowser();
            }
            else
            {
                launcherToken = Program.NewToken();
                try
                {
                    child = Program.StartServer(root, launcherToken);
                    ownsServer = true;
                    timer.Start();
                }
                catch (Exception error)
                {
                    tray.ShowBalloonTip(5000, "API Hub failed to start", error.Message, ToolTipIcon.Error);
                }
            }
        }

        void PollHealth(object sender, EventArgs args)
        {
            attempts++;
            if (Program.IsHealthy())
            {
                timer.Stop();
                tray.ShowBalloonTip(2500, "API Hub is ready", "The secure local control plane is running.", ToolTipIcon.Info);
                Program.OpenBrowser();
                return;
            }
            if ((child != null && child.HasExited) || attempts >= 40)
            {
                timer.Stop();
                tray.ShowBalloonTip(5000, "API Hub failed to start", "Check that the bundled runtime exists and port 4310 is free.", ToolTipIcon.Error);
            }
        }

        void StopAndExit()
        {
            if (ownsServer && child != null && !child.HasExited)
            {
                Program.RequestShutdown(launcherToken);
                if (!child.WaitForExit(4000)) child.Kill();
            }
            tray.Visible = false;
            ExitThread();
        }

        protected override void ExitThreadCore()
        {
            timer.Stop();
            tray.Visible = false;
            tray.Dispose();
            timer.Dispose();
            base.ExitThreadCore();
        }
    }
}
