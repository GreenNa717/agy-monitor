using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Forms;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace AgyBackdropCompanion
{
    internal sealed class ThemeConfig
    {
        public bool backdropEnabled = true;
        public bool hudEnabled = true;
        public string hostThemeMode = "inject";
        public int hostBlendPct = 25;
        public string activeWallpaperId = "wp-1";
        public int opacity = 100;
        public int blur = 0;
        public int dim = 0;
        public int radius = 10;
        public string fit = "cover";
        public string canvasColor = "#14161D";
        public string accentColor = "#5B8CFF";
        public string wallpaperPath = "";
        public bool zeroUiaMode = false;
    }

    internal sealed class HudDisplayConfig
    {
        public bool showSpeed = true;
        public bool showCacheHit = true;
        public bool showModel = true;
        public bool showContext = true;
        public bool showQuota = true;

        public HudDisplayConfig Clone()
        {
            return new HudDisplayConfig
            {
                showSpeed = showSpeed,
                showCacheHit = showCacheHit,
                showModel = showModel,
                showContext = showContext,
                showQuota = showQuota
            };
        }
    }

    internal sealed class HudSessionEntry
    {
        public string id = "";
        public string title = "";
        public string workspace = "";
        public int percent = 0;
        public long totalUsed = 0;
        public long windowCap = 512000;
        public double? tokPerSec = null;
        public int? cacheHitPct = null;
        public string upstreamModelId = "";
    }

    internal sealed class HudTelemetry
    {
        public int percent = 0;
        public long totalUsed = 0;
        public long windowCap = 512000;
        public double? tokPerSec = null;
        public int? cacheHitPct = null;
        public string upstreamModelId = "";
        public string upstreamModelStatus = "no_baseline";
        public bool cdpHudActive = false;
        public List<HudSessionEntry> sessions = new List<HudSessionEntry>();
    }

    internal struct HudAnchorInfo
    {
        public bool HasAnchor;
        public bool ComposerVisible;
        public bool Occluded;
        public bool FromUia;
        public int RightX;
        public int LeftGuardX;
        public int CenterY;
        public int AnchorWinLeft;
        public int AnchorWinTop;
        public int AnchorWinRight;
        public int AnchorWinBottom;
    }

    internal struct ActiveViewInfo
    {
        public string Workspace;
        public string Title;
        public bool IsNewConversation;
    }

    internal static class Native
    {
        public const int GWLP_HWNDPARENT = -8;
        public const int GWL_EXSTYLE = -20;
        public const int WS_EX_TRANSPARENT = 0x00000020;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
        public const int WS_EX_LAYERED = 0x00080000;
        public const int WS_EX_NOACTIVATE = 0x08000000;

        public const uint LWA_ALPHA = 0x00000002;

        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOZORDER = 0x0004;
        public const uint SWP_NOACTIVATE = 0x0010;
        public const uint SWP_SHOWWINDOW = 0x0040;
        public const uint SWP_HIDEWINDOW = 0x0080;

        public const int SW_HIDE = 0;
        public const int SW_SHOWNOACTIVATE = 4;

        public const uint GW_HWNDNEXT = 2;
        public const uint GW_HWNDPREV = 3;
        public const uint GW_OWNER = 4;

        public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
        public const int DWMWA_CLOAKED = 14;
        public const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
        public const int DWMWCP_DONOTROUND = 1;
        public const int DWMWCP_ROUND = 2;

        public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
        public const uint EVENT_SYSTEM_MOVESIZESTART = 0x000A;
        public const uint EVENT_SYSTEM_MOVESIZEEND = 0x000B;
        public const uint EVENT_SYSTEM_MINIMIZESTART = 0x0016;
        public const uint EVENT_SYSTEM_MINIMIZEEND = 0x0017;
        public const uint EVENT_OBJECT_DESTROY = 0x8001;
        public const uint EVENT_OBJECT_SHOW = 0x8002;
        public const uint EVENT_OBJECT_HIDE = 0x8003;
        public const uint EVENT_OBJECT_REORDER = 0x8004;
        public const uint EVENT_OBJECT_FOCUS = 0x8005;
        public const uint EVENT_OBJECT_SELECTION = 0x8006;
        public const uint EVENT_OBJECT_LOCATIONCHANGE = 0x800B;
        public const uint WINEVENT_OUTOFCONTEXT = 0x0000;
        public const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
        public const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

        public const uint RDW_INVALIDATE = 0x0001;
        public const uint RDW_FRAME = 0x0400;
        public const uint RDW_UPDATENOW = 0x0100;

        public const uint INPUT_MOUSE = 0;
        public const uint MOUSEEVENTF_MOVE = 0x0001;
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP = 0x0004;
        public const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
        public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        public const int SM_XVIRTUALSCREEN = 76;
        public const int SM_YVIRTUALSCREEN = 77;
        public const int SM_CXVIRTUALSCREEN = 78;
        public const int SM_CYVIRTUALSCREEN = 79;
        public const int VK_LBUTTON = 0x01;
        public const int VK_RBUTTON = 0x02;
        public const int VK_BACK = 0x08;
        public const int VK_RETURN = 0x0D;
        public const int VK_ESCAPE = 0x1B;

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct INPUTUNION
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT
        {
            public uint type;
            public INPUTUNION U;
        }

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        public delegate void WinEventDelegate(
            IntPtr hWinEventHook,
            uint eventType,
            IntPtr hwnd,
            int idObject,
            int idChild,
            uint dwEventThread,
            uint dwmsEventTime
        );

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsZoomed(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        public static extern int SHParseDisplayName(
            [MarshalAs(UnmanagedType.LPWStr)] string name,
            IntPtr bindingContext,
            out IntPtr pidl,
            uint sfgaoIn,
            out uint psfgaoOut
        );

        [DllImport("shell32.dll")]
        public static extern int SHOpenFolderAndSelectItems(
            IntPtr pidlFolder,
            uint cidl,
            IntPtr apidl,
            uint dwFlags
        );

        [DllImport("ole32.dll")]
        public static extern void CoTaskMemFree(IntPtr pv);

        public static void ForceActivateWindow(IntPtr targetHwnd)
        {
            if (targetHwnd == IntPtr.Zero || !IsWindow(targetHwnd)) return;
            uint fgTid = 0;
            uint curTid = GetCurrentThreadId();
            bool attached = false;
            try
            {
                IntPtr fg = GetForegroundWindow();
                if (fg != IntPtr.Zero && fg != targetHwnd)
                {
                    uint fgPid;
                    fgTid = GetWindowThreadProcessId(fg, out fgPid);
                    if (fgTid != 0 && fgTid != curTid)
                    {
                        attached = AttachThreadInput(fgTid, curTid, true);
                    }
                }
                BringWindowToTop(targetHwnd);
                SetForegroundWindow(targetHwnd);
            }
            catch { }
            finally
            {
                if (attached)
                {
                    try { AttachThreadInput(fgTid, curTid, false); } catch { }
                }
            }
        }

        [DllImport("user32.dll")]
        public static extern bool DestroyIcon(IntPtr hIcon);

        [DllImport("user32.dll")]
        public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("kernel32.dll")]
        public static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetProcessWorkingSetSize(IntPtr hProcess, IntPtr dwMinimumWorkingSetSize, IntPtr dwMaximumWorkingSetSize);

        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        public static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
        private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
        private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
        private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
        private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

        public static long GetWindowLongPtrCompat(IntPtr hWnd, int nIndex)
        {
            if (IntPtr.Size == 8) return GetWindowLongPtr64(hWnd, nIndex).ToInt64();
            return GetWindowLong32(hWnd, nIndex);
        }

        public static long SetWindowLongPtrCompat(IntPtr hWnd, int nIndex, long dwNewLong)
        {
            if (IntPtr.Size == 8) return SetWindowLongPtr64(hWnd, nIndex, new IntPtr(dwNewLong)).ToInt64();
            return SetWindowLong32(hWnd, nIndex, unchecked((int)dwNewLong));
        }

        [DllImport("user32.dll")]
        public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);

        [DllImport("user32.dll")]
        public static extern bool GetLayeredWindowAttributes(IntPtr hwnd, out uint pcrKey, out byte pbAlpha, out uint pdwFlags);

        [DllImport("user32.dll")]
        public static extern IntPtr BeginDeferWindowPos(int nNumWindows);

        [DllImport("user32.dll")]
        public static extern IntPtr DeferWindowPos(
            IntPtr hWinPosInfo,
            IntPtr hWnd,
            IntPtr hWndInsertAfter,
            int x,
            int y,
            int cx,
            int cy,
            uint uFlags
        );

        [DllImport("user32.dll")]
        public static extern bool EndDeferWindowPos(IntPtr hWinPosInfo);

        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateRoundRectRgn(
            int nLeftRect,
            int nTopRect,
            int nRightRect,
            int nBottomRect,
            int nWidthEllipse,
            int nHeightEllipse
        );

        [DllImport("user32.dll")]
        public static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);

        [DllImport("gdi32.dll")]
        public static extern bool DeleteObject(IntPtr hObject);

        [DllImport("user32.dll")]
        public static extern bool SetWindowPos(
            IntPtr hWnd,
            IntPtr hWndInsertAfter,
            int X,
            int Y,
            int cx,
            int cy,
            uint uFlags
        );

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool RedrawWindow(IntPtr hWnd, IntPtr lprcUpdate, IntPtr hrgnUpdate, uint flags);

        [DllImport("user32.dll")]
        public static extern IntPtr SetWinEventHook(
            uint eventMin,
            uint eventMax,
            IntPtr hmodWinEventProc,
            WinEventDelegate lpfnWinEventProc,
            uint idProcess,
            uint idThread,
            uint dwFlags
        );

        [DllImport("user32.dll")]
        public static extern bool UnhookWinEvent(IntPtr hWinEventHook);

        [DllImport("user32.dll")]
        public static extern IntPtr GetThreadDesktop(uint dwThreadId);

        [DllImport("kernel32.dll")]
        public static extern uint GetCurrentThreadId();

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern bool GetUserObjectInformation(
            IntPtr hObj,
            int nIndex,
            StringBuilder pvInfo,
            int nLength,
            out int lpnLengthNeeded
        );

        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);

        [DllImport("dwmapi.dll")]
        public static extern int DwmSetWindowAttribute(IntPtr hwnd, int dwAttribute, ref int pvAttribute, int cbAttribute);

        [DllImport("user32.dll")]
        private static extern IntPtr SetProcessDpiAwarenessContext(IntPtr dpiContext);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        private static extern uint GetDpiForWindow(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

        [DllImport("shcore.dll")]
        private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

        private const uint MONITOR_DEFAULTTONEAREST = 2;
        private const int MDT_EFFECTIVE_DPI = 0;

        public static void EnablePerMonitorDpi()
        {
            try
            {
                if (SetProcessDpiAwarenessContext(new IntPtr(-4)) != IntPtr.Zero) return;
            }
            catch { }
            try
            {
                SetProcessDPIAware();
            }
            catch { }
        }

        public static double GetWindowDpiScale(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero) return 1.0;
            try
            {
                uint dpi = GetDpiForWindow(hwnd);
                if (dpi >= 72 && dpi <= 384)
                {
                    return dpi / 96.0;
                }
            }
            catch { }
            try
            {
                IntPtr hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                if (hmon != IntPtr.Zero)
                {
                    uint dx, dy;
                    if (GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, out dx, out dy) == 0 && dx >= 72 && dx <= 384)
                    {
                        return dx / 96.0;
                    }
                }
            }
            catch { }
            return 1.0;
        }

        public static bool TryGetVisibleBounds(IntPtr hwnd, out RECT rect)
        {
            rect = new RECT();
            try
            {
                int hr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf(typeof(RECT)));
                if (hr == 0 && (rect.Right - rect.Left) > 0 && (rect.Bottom - rect.Top) > 0)
                {
                    return true;
                }
            }
            catch { }
            return GetWindowRect(hwnd, out rect);
        }

        public static bool IsWindowCloaked(IntPtr hwnd)
        {
            try
            {
                int cloaked = 0;
                int hr = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out cloaked, Marshal.SizeOf(typeof(int)));
                return hr == 0 && cloaked != 0;
            }
            catch
            {
                return false;
            }
        }

        public static bool IsWindowStrictlyBehind(IntPtr wpHwnd, IntPtr hostHwnd)
        {
            if (wpHwnd == IntPtr.Zero || hostHwnd == IntPtr.Zero) return false;
            if (!IsWindow(wpHwnd) || !IsWindow(hostHwnd)) return false;

            // Walk UP from hostHwnd: if wpHwnd EVER appears above hostHwnd, it is covering the host!
            IntPtr cur = GetWindow(hostHwnd, GW_HWNDPREV);
            int upSteps = 0;
            while (cur != IntPtr.Zero && upSteps < 512)
            {
                if (cur == wpHwnd) return false;
                cur = GetWindow(cur, GW_HWNDPREV);
                upSteps++;
            }

            // Walk DOWN from hostHwnd: confirm wpHwnd actually sits below hostHwnd in Z-order
            cur = GetWindow(hostHwnd, GW_HWNDNEXT);
            int downSteps = 0;
            while (cur != IntPtr.Zero && downSteps < 128)
            {
                if (cur == wpHwnd) return true;
                cur = GetWindow(cur, GW_HWNDNEXT);
                downSteps++;
            }
            return false;
        }

        public static bool IsDirectlyBehindVisible(IntPtr wpHwnd, IntPtr hostHwnd, RECT hostRect, out string blockerClass)
        {
            blockerClass = "";
            if (wpHwnd == IntPtr.Zero || hostHwnd == IntPtr.Zero) return false;
            IntPtr cur = GetWindow(hostHwnd, GW_HWNDNEXT);
            int steps = 0;
            while (cur != IntPtr.Zero && steps < 48)
            {
                if (cur == wpHwnd) return true;
                // Skip invisible / cloaked / zero-size / non-overlapping / zero-alpha helper windows between host and backdrop
                if (IsWindowVisible(cur) && !IsIconic(cur) && !IsWindowCloaked(cur))
                {
                    RECT cr;
                    if (GetWindowRect(cur, out cr) &&
                        (cr.Right - cr.Left) > 4 &&
                        (cr.Bottom - cr.Top) > 4 &&
                        cr.Right > hostRect.Left &&
                        cr.Left < hostRect.Right &&
                        cr.Bottom > hostRect.Top &&
                        cr.Top < hostRect.Bottom)
                    {
                        bool zeroAlpha = false;
                        try
                        {
                            long curEx = GetWindowLongPtrCompat(cur, GWL_EXSTYLE);
                            if ((curEx & WS_EX_LAYERED) != 0)
                            {
                                uint ck, lf;
                                byte a;
                                if (GetLayeredWindowAttributes(cur, out ck, out a, out lf) && (lf & LWA_ALPHA) != 0 && a == 0)
                                {
                                    zeroAlpha = true;
                                }
                            }
                        }
                        catch { }
                        if (!zeroAlpha)
                        {
                            try
                            {
                                var sb = new StringBuilder(128);
                                if (GetClassName(cur, sb, sb.Capacity) > 0) blockerClass = sb.ToString();
                            }
                            catch { }
                            return false;
                        }
                    }
                }
                cur = GetWindow(cur, GW_HWNDNEXT);
                steps++;
            }
            return false;
        }

        public static bool IsWindowTranslucentLayered(IntPtr hwnd, out byte alpha)
        {
            alpha = 255;
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return false;
            try
            {
                long curEx = GetWindowLongPtrCompat(hwnd, GWL_EXSTYLE);
                if ((curEx & WS_EX_LAYERED) == 0) return false;
                uint ck, lflags;
                byte actualAlpha;
                if (GetLayeredWindowAttributes(hwnd, out ck, out actualAlpha, out lflags))
                {
                    alpha = actualAlpha;
                    return (lflags & LWA_ALPHA) != 0 && actualAlpha < 255;
                }
            }
            catch { }
            return false;
        }

        public static void ForceRestoreWindowOpaque(IntPtr hwnd, bool originallyLayered)
        {
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return;
            try
            {
                long curEx = GetWindowLongPtrCompat(hwnd, GWL_EXSTYLE);
                if ((curEx & WS_EX_LAYERED) == 0) return;
                if (originallyLayered)
                {
                    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
                }
                else
                {
                    SetWindowLongPtrCompat(hwnd, GWL_EXSTYLE, curEx & ~WS_EX_LAYERED);
                    RedrawWindow(hwnd, IntPtr.Zero, IntPtr.Zero, RDW_INVALIDATE | RDW_FRAME | RDW_UPDATENOW);
                }
            }
            catch { }
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetWindowTextW")]
        private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("psapi.dll", SetLastError = true)]
        public static extern bool EmptyWorkingSet(IntPtr hProcess);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool QueryFullProcessImageName(IntPtr hProcess, int dwFlags, StringBuilder lpExeName, ref int lpdwSize);

        public static string GetProcessBaseNameFast(uint pid)
        {
            if (pid == 0) return "";
            IntPtr hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (hProc == IntPtr.Zero) return "";
            try
            {
                var sb = new StringBuilder(512);
                int len = sb.Capacity;
                if (QueryFullProcessImageName(hProc, 0, sb, ref len) && len > 0)
                {
                    return System.IO.Path.GetFileNameWithoutExtension(sb.ToString(0, len));
                }
            }
            catch { }
            finally
            {
                CloseHandle(hProc);
            }
            return "";
        }

        public static string GetWindowTitleText(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero) return "";
            try
            {
                var sb = new StringBuilder(256);
                int len = GetWindowTextW(hwnd, sb, sb.Capacity);
                if (len > 0) return sb.ToString(0, Math.Min(len, sb.Length)).Trim();
            }
            catch { }
            return "";
        }

        public static void TrimWorkingSet()
        {
            try
            {
                GC.Collect(2, GCCollectionMode.Forced, true);
                GC.WaitForPendingFinalizers();
                GC.Collect(2, GCCollectionMode.Forced, true);
                IntPtr cur = GetCurrentProcess();
                if (!EmptyWorkingSet(cur))
                {
                    SetProcessWorkingSetSize(cur, new IntPtr(-1), new IntPtr(-1));
                }
            }
            catch { }
        }

        public static int GetMaxMonitorPhysicalWidth()
        {
            int maxW = 1920;
            try
            {
                Screen[] screens = Screen.AllScreens;
                if (screens != null)
                {
                    for (int i = 0; i < screens.Length; i++)
                    {
                        int w = screens[i].Bounds.Width;
                        if (w > maxW) maxW = w;
                    }
                }
            }
            catch { }
            return Math.Max(1280, Math.Min(2560, maxW));
        }

        public static string GetDesktopName()
        {
            try
            {
                var sb = new StringBuilder(128);
                int needed = 0;
                if (GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()), 2, sb, sb.Capacity, out needed))
                {
                    return sb.ToString();
                }
            }
            catch { }
            return "unknown";
        }
    }

    internal static class ColorUtil
    {
        public static System.Windows.Media.Color ParseHex(string hex, System.Windows.Media.Color fallback)
        {
            if (string.IsNullOrEmpty(hex)) return fallback;
            string s = hex.Trim();
            if (s.StartsWith("#")) s = s.Substring(1);
            if (s.Length != 6) return fallback;
            try
            {
                byte r = Convert.ToByte(s.Substring(0, 2), 16);
                byte g = Convert.ToByte(s.Substring(2, 2), 16);
                byte b = Convert.ToByte(s.Substring(4, 2), 16);
                return System.Windows.Media.Color.FromRgb(r, g, b);
            }
            catch
            {
                return fallback;
            }
        }
    }

    internal static class BitmapUtil
    {
        public static bool TryProbeImageDimensions(string filePath, out int srcWidth, out int srcHeight)
        {
            srcWidth = 0;
            srcHeight = 0;
            try
            {
                if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return false;
                using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    BitmapDecoder decoder = BitmapDecoder.Create(
                        fs,
                        BitmapCreateOptions.DelayCreation | BitmapCreateOptions.IgnoreColorProfile,
                        BitmapCacheOption.None);
                    if (decoder != null && decoder.Frames != null && decoder.Frames.Count > 0)
                    {
                        BitmapFrame frame = decoder.Frames[0];
                        srcWidth = frame.PixelWidth;
                        srcHeight = frame.PixelHeight;
                        return srcWidth > 0 && srcHeight > 0;
                    }
                }
            }
            catch { }
            return false;
        }

        /// <summary>
        /// Pre-renders a blurred wallpaper ONCE into a frozen WriteableBitmap via a fast 3-pass separable box blur
        /// (approximating Gaussian blur in O(W*H) independent of radius) so BackdropSurfaceWindow needs no live BlurEffect.
        /// </summary>
        public static BitmapSource CreatePreBlurredBitmap(BitmapSource source, int blurLevel)
        {
            if (source == null) return null;
            int blur = Math.Max(0, Math.Min(24, blurLevel));
            if (blur <= 0) return source;

            try
            {
                int srcW = source.PixelWidth;
                int srcH = source.PixelHeight;
                if (srcW <= 1 || srcH <= 1) return source;

                int maxBlurWidth = blur <= 3 ? 1920 : (blur <= 10 ? 1280 : 960);
                double scale = srcW > maxBlurWidth ? ((double)maxBlurWidth / srcW) : 1.0;

                BitmapSource working = source;
                if (working.Format != PixelFormats.Pbgra32)
                {
                    var converted = new FormatConvertedBitmap();
                    converted.BeginInit();
                    converted.Source = working;
                    converted.DestinationFormat = PixelFormats.Pbgra32;
                    converted.EndInit();
                    working = converted;
                }
                if (scale < 0.999)
                {
                    var scaled = new TransformedBitmap();
                    scaled.BeginInit();
                    scaled.Source = working;
                    scaled.Transform = new ScaleTransform(scale, scale);
                    scaled.EndInit();
                    working = scaled;
                }

                int w = Math.Max(1, working.PixelWidth);
                int h = Math.Max(1, working.PixelHeight);
                int stride = w * 4;
                byte[] bufA = new byte[stride * h];
                byte[] bufB = new byte[stride * h];
                working.CopyPixels(bufA, stride, 0);

                int radius = Math.Max(1, (int)Math.Round(blur * 0.65 * scale));
                int div = radius * 2 + 1;

                for (int pass = 0; pass < 3; pass++)
                {
                    // Horizontal sliding-window pass: bufA -> bufB
                    for (int y = 0; y < h; y++)
                    {
                        int row = y * stride;
                        int sumB = 0, sumG = 0, sumR = 0, sumA = 0;
                        for (int k = -radius; k <= radius; k++)
                        {
                            int sx = k < 0 ? 0 : (k >= w ? w - 1 : k);
                            int off = row + sx * 4;
                            sumB += bufA[off];
                            sumG += bufA[off + 1];
                            sumR += bufA[off + 2];
                            sumA += bufA[off + 3];
                        }
                        for (int x = 0; x < w; x++)
                        {
                            int dstOff = row + x * 4;
                            bufB[dstOff] = (byte)(sumB / div);
                            bufB[dstOff + 1] = (byte)(sumG / div);
                            bufB[dstOff + 2] = (byte)(sumR / div);
                            bufB[dstOff + 3] = (byte)(sumA / div);

                            int outX = x - radius;
                            if (outX < 0) outX = 0;
                            int inX = x + radius + 1;
                            if (inX >= w) inX = w - 1;
                            int outOff = row + outX * 4;
                            int inOff = row + inX * 4;
                            sumB += bufA[inOff] - bufA[outOff];
                            sumG += bufA[inOff + 1] - bufA[outOff + 1];
                            sumR += bufA[inOff + 2] - bufA[outOff + 2];
                            sumA += bufA[inOff + 3] - bufA[outOff + 3];
                        }
                    }

                    // Vertical sliding-window pass: bufB -> bufA
                    for (int x = 0; x < w; x++)
                    {
                        int xOff = x * 4;
                        int sumB = 0, sumG = 0, sumR = 0, sumA = 0;
                        for (int k = -radius; k <= radius; k++)
                        {
                            int sy = k < 0 ? 0 : (k >= h ? h - 1 : k);
                            int off = sy * stride + xOff;
                            sumB += bufB[off];
                            sumG += bufB[off + 1];
                            sumR += bufB[off + 2];
                            sumA += bufB[off + 3];
                        }
                        for (int y = 0; y < h; y++)
                        {
                            int dstOff = y * stride + xOff;
                            bufA[dstOff] = (byte)(sumB / div);
                            bufA[dstOff + 1] = (byte)(sumG / div);
                            bufA[dstOff + 2] = (byte)(sumR / div);
                            bufA[dstOff + 3] = (byte)(sumA / div);

                            int outY = y - radius;
                            if (outY < 0) outY = 0;
                            int inY = y + radius + 1;
                            if (inY >= h) inY = h - 1;
                            int outOff = outY * stride + xOff;
                            int inOff = inY * stride + xOff;
                            sumB += bufB[inOff] - bufB[outOff];
                            sumG += bufB[inOff + 1] - bufB[outOff + 1];
                            sumR += bufB[inOff + 2] - bufB[outOff + 2];
                            sumA += bufB[inOff + 3] - bufB[outOff + 3];
                        }
                    }
                }

                var wb = new WriteableBitmap(w, h, 96.0, 96.0, PixelFormats.Pbgra32, null);
                wb.WritePixels(new Int32Rect(0, 0, w, h), bufA, stride, 0);
                wb.Freeze();
                return wb;
            }
            catch
            {
                return source;
            }
        }
    }

    internal sealed class BackdropSurfaceWindow : Window
    {
        private readonly Border _frameBorder;
        private readonly System.Windows.Controls.Image _image;
        private readonly System.Windows.Shapes.Rectangle _dimRect;
        private IntPtr _hwnd = IntPtr.Zero;
        private string _loadedPath = "";
        private bool _interactiveResizing = false;
        private System.Windows.Media.Color _lastCanvasColor = System.Windows.Media.Color.FromRgb(7, 7, 9);
        private SolidColorBrush _cachedCanvasBrush;
        private int _lastCornerW = -1;
        private int _lastCornerH = -1;
        private int _lastCornerRadius = -1;
        private bool _lastCornerMax = false;
        private bool _dwmCornerSupported = true;

        public IntPtr Handle { get { return _hwnd; } }

        private static SolidColorBrush CreateFrozenBrush(System.Windows.Media.Color col)
        {
            var b = new SolidColorBrush(col);
            b.Freeze();
            return b;
        }

        public BackdropSurfaceWindow()
        {
            WindowStyle = WindowStyle.None;
            // Hardware-accelerated DirectX surface (opaque canvas + native DWM/region corners) eliminates software resize lag
            AllowsTransparency = false;
            _cachedCanvasBrush = CreateFrozenBrush(_lastCanvasColor);
            Background = _cachedCanvasBrush;
            ShowInTaskbar = false;
            ShowActivated = false;
            Focusable = false;
            IsHitTestVisible = false;
            ResizeMode = ResizeMode.NoResize;
            Left = -32000;
            Top = -32000;
            Width = 100;
            Height = 100;

            _image = new System.Windows.Controls.Image
            {
                Stretch = Stretch.UniformToFill,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            RenderOptions.SetBitmapScalingMode(_image, BitmapScalingMode.Linear);

            _dimRect = new System.Windows.Shapes.Rectangle
            {
                Fill = _cachedCanvasBrush,
                Opacity = 0.2
            };

            var grid = new Grid { ClipToBounds = true };
            grid.Children.Add(_image);
            grid.Children.Add(_dimRect);

            _frameBorder = new Border
            {
                CornerRadius = new CornerRadius(0),
                ClipToBounds = true,
                Background = _cachedCanvasBrush,
                Child = grid
            };

            Content = _frameBorder;

            SourceInitialized += delegate
            {
                _hwnd = new WindowInteropHelper(this).Handle;
                long ex = Native.GetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE);
                ex |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW;
                Native.SetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE, ex);
                HwndSource src = HwndSource.FromHwnd(_hwnd);
                if (src != null)
                {
                    src.AddHook(BackdropWndProc);
                }
            };

            Closed += delegate
            {
                ReleaseSurfaceResources();
            };
        }

        private static IntPtr BackdropWndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == 0x0084) // WM_NCHITTEST -> HTTRANSPARENT (click-through without non-layered WS_EX_TRANSPARENT GDI side effects)
            {
                handled = true;
                return new IntPtr(-1);
            }
            if (msg == 0x0021) // WM_MOUSEACTIVATE -> MA_NOACTIVATE
            {
                handled = true;
                return new IntPtr(3);
            }
            return IntPtr.Zero;
        }

        public void ReleaseSurfaceResources()
        {
            _loadedPath = "";
            if (_image != null)
            {
                if (_image.Effect != null) _image.Effect = null;
                _image.Source = null;
                _image.Margin = new Thickness(0);
            }
        }

        private void ApplyBlurAndScaling()
        {
            // Blurring is pre-rendered offline into a single frozen bitmap in CompanionController;
            // keep Effect = null on the live full-screen Image so WPF never allocates D3D9 blur render targets.
            RenderOptions.SetBitmapScalingMode(
                _image,
                _interactiveResizing ? BitmapScalingMode.LowQuality : BitmapScalingMode.Linear);
            if (_image.Effect != null)
            {
                _image.Effect = null;
            }
            if (_image.Margin.Left != 0 || _image.Margin.Top != 0 || _image.Margin.Right != 0 || _image.Margin.Bottom != 0)
            {
                _image.Margin = new Thickness(0);
            }
        }

        public void SetInteractiveResizeMode(bool resizing)
        {
            if (_interactiveResizing == resizing) return;
            _interactiveResizing = resizing;
            ApplyBlurAndScaling();
        }

        public void ApplyNativeRoundedCorners(int physW, int physH, double dpiScale, bool isMaximized, int radius)
        {
            if (_hwnd == IntPtr.Zero || !Native.IsWindow(_hwnd)) return;
            int effRadius = isMaximized ? 0 : Math.Max(0, Math.Min(18, radius));
            if (_dwmCornerSupported && isMaximized == _lastCornerMax && effRadius == _lastCornerRadius)
            {
                return;
            }
            if (!_dwmCornerSupported &&
                physW == _lastCornerW &&
                physH == _lastCornerH &&
                effRadius == _lastCornerRadius &&
                isMaximized == _lastCornerMax)
            {
                return;
            }

            if (_dwmCornerSupported)
            {
                try
                {
                    int pref = effRadius > 0 ? Native.DWMWCP_ROUND : Native.DWMWCP_DONOTROUND;
                    int hr = Native.DwmSetWindowAttribute(_hwnd, Native.DWMWA_WINDOW_CORNER_PREFERENCE, ref pref, sizeof(int));
                    if (hr == 0)
                    {
                        _lastCornerMax = isMaximized;
                        _lastCornerRadius = effRadius;
                        _lastCornerW = physW;
                        _lastCornerH = physH;
                        return;
                    }
                }
                catch { }
                _dwmCornerSupported = false;
            }

            // Windows 10 fallback: hardware-clipped rounded window region
            try
            {
                if (effRadius <= 0 || physW <= 0 || physH <= 0)
                {
                    Native.SetWindowRgn(_hwnd, IntPtr.Zero, true);
                }
                else
                {
                    int diam = Math.Max(2, (int)Math.Round(effRadius * 2.0 * Math.Max(0.75, dpiScale)));
                    IntPtr rgn = Native.CreateRoundRectRgn(0, 0, physW + 1, physH + 1, diam, diam);
                    if (rgn != IntPtr.Zero)
                    {
                        if (Native.SetWindowRgn(_hwnd, rgn, true) == 0)
                        {
                            Native.DeleteObject(rgn);
                        }
                    }
                }
                _lastCornerMax = isMaximized;
                _lastCornerRadius = effRadius;
                _lastCornerW = physW;
                _lastCornerH = physH;
            }
            catch { }
        }

        public void ApplyVisuals(ThemeConfig cfg, BitmapSource sharedImage, bool isMaximized)
        {
            System.Windows.Media.Color canvasCol = ColorUtil.ParseHex(cfg.canvasColor, System.Windows.Media.Color.FromRgb(7, 7, 9));
            if (_cachedCanvasBrush == null || _lastCanvasColor != canvasCol)
            {
                _lastCanvasColor = canvasCol;
                _cachedCanvasBrush = CreateFrozenBrush(canvasCol);
            }
            Background = _cachedCanvasBrush;
            _frameBorder.Background = _cachedCanvasBrush;
            _dimRect.Fill = _cachedCanvasBrush;

            double imgOpacity = Math.Max(0.0, Math.Min(1.0, cfg.opacity / 100.0));
            _image.Opacity = imgOpacity;

            double dimFrac = Math.Max(0.0, Math.Min(0.85, cfg.dim / 100.0));
            _dimRect.Opacity = dimFrac;

            _image.Stretch = string.Equals(cfg.fit, "contain", StringComparison.OrdinalIgnoreCase)
                ? Stretch.Uniform
                : Stretch.UniformToFill;

            ApplyBlurAndScaling();

            if (!string.Equals(_loadedPath, cfg.wallpaperPath ?? "", StringComparison.OrdinalIgnoreCase) || _image.Source != sharedImage)
            {
                _loadedPath = cfg.wallpaperPath ?? "";
                _image.Source = sharedImage;
            }
        }
    }

    internal sealed class ImageLightboxWindow : Window
    {
        private readonly IntPtr _ownerHwnd;
        private readonly ScaleTransform _rootScale = new ScaleTransform(1.0, 1.0);
        private readonly Border _rootFrame;
        private readonly Grid _stageGrid;
        private readonly Border _imageFrame;
        private readonly System.Windows.Controls.Image _image;
        private readonly ScaleTransform _scaleTransform = new ScaleTransform(1.0, 1.0);
        private readonly TranslateTransform _translateTransform = new TranslateTransform(0.0, 0.0);
        private readonly TextBlock _nameText;
        private readonly TextBlock _dimText;
        private readonly TextBlock _zoomPctText;

        private IntPtr _hwnd = IntPtr.Zero;
        private string _filePath = "";
        private double _scale = 1.0;
        private bool _dragging = false;
        private System.Windows.Point _dragStart;
        private double _dragOriginX = 0.0;
        private double _dragOriginY = 0.0;
        private int _lastBoundsLeft = int.MinValue;
        private int _lastBoundsTop = int.MinValue;
        private int _lastBoundsW = -1;
        private int _lastBoundsH = -1;
        private double _lastBoundsDpi = -1.0;
        private bool _lastBoundsMax = false;
        private int _lastBoundsRadius = -1;

        public IntPtr Handle { get { return _hwnd; } }

        public ImageLightboxWindow(IntPtr ownerHwnd)
        {
            _ownerHwnd = ownerHwnd;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = System.Windows.Media.Brushes.Transparent;
            ShowInTaskbar = false;
            ShowActivated = true;
            Focusable = true;
            ResizeMode = ResizeMode.NoResize;
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);
            TextOptions.SetTextRenderingMode(this, TextRenderingMode.ClearType);

            var uiFont = new System.Windows.Media.FontFamily("Segoe UI, Microsoft YaHei UI");
            var monoFont = new System.Windows.Media.FontFamily("Consolas, Segoe UI, Microsoft YaHei UI");

            _image = new System.Windows.Controls.Image
            {
                Stretch = Stretch.Uniform,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            RenderOptions.SetBitmapScalingMode(_image, BitmapScalingMode.HighQuality);

            var txGroup = new TransformGroup();
            txGroup.Children.Add(_scaleTransform);
            txGroup.Children.Add(_translateTransform);

            _imageFrame = new Border
            {
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(20, 22, 29)),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(46, 255, 255, 255)),
                ClipToBounds = true,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                RenderTransformOrigin = new System.Windows.Point(0.5, 0.5),
                RenderTransform = txGroup,
                Cursor = System.Windows.Input.Cursors.Hand,
                Effect = new DropShadowEffect
                {
                    BlurRadius = 32,
                    ShadowDepth = 8,
                    Opacity = 0.72,
                    Color = Colors.Black
                },
                Child = _image
            };

            _imageFrame.MouseLeftButtonDown += OnImageMouseDown;
            _imageFrame.MouseMove += OnImageMouseMove;
            _imageFrame.MouseLeftButtonUp += OnImageMouseUp;
            _imageFrame.LostMouseCapture += delegate { EndDrag(); };

            _stageGrid = new Grid
            {
                ClipToBounds = true,
                Background = System.Windows.Media.Brushes.Transparent,
                Margin = new Thickness(28, 36, 28, 76)
            };
            _stageGrid.Children.Add(_imageFrame);
            _stageGrid.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e)
            {
                if (e.OriginalSource == _stageGrid)
                {
                    e.Handled = true;
                    Close();
                }
            };

            // Top-right circular close button
            Border closeBtn = MakePillButton(
                "×",
                uiFont,
                18,
                FontWeights.Normal,
                System.Windows.Media.Color.FromArgb(230, 42, 46, 61),
                System.Windows.Media.Color.FromArgb(245, 62, 68, 88),
                System.Windows.Media.Color.FromArgb(62, 255, 255, 255),
                System.Windows.Media.Color.FromRgb(234, 233, 240),
                17,
                new Thickness(0)
            );
            closeBtn.Width = 34;
            closeBtn.Height = 34;
            closeBtn.HorizontalAlignment = System.Windows.HorizontalAlignment.Right;
            closeBtn.VerticalAlignment = VerticalAlignment.Top;
            closeBtn.Margin = new Thickness(0, 18, 18, 0);
            closeBtn.ToolTip = "关闭预览 (Esc)";
            closeBtn.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                Close();
            };

            // Bottom floating capsule bar
            _nameText = new TextBlock
            {
                Text = "",
                FontFamily = monoFont,
                FontSize = 11.5,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 220, 228)),
                VerticalAlignment = VerticalAlignment.Center,
                MaxWidth = 220,
                TextTrimming = TextTrimming.CharacterEllipsis
            };

            _dimText = new TextBlock
            {
                Text = "",
                FontFamily = monoFont,
                FontSize = 10.5,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(138, 140, 154)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(6, 0, 0, 0)
            };

            var zoomOutBtn = MakePillButton(
                "−",
                uiFont,
                13,
                FontWeights.SemiBold,
                System.Windows.Media.Color.FromArgb(0, 0, 0, 0),
                System.Windows.Media.Color.FromArgb(220, 56, 62, 82),
                System.Windows.Media.Color.FromArgb(0, 0, 0, 0),
                System.Windows.Media.Color.FromRgb(226, 226, 234),
                6,
                new Thickness(0)
            );
            zoomOutBtn.Width = 24;
            zoomOutBtn.Height = 22;
            zoomOutBtn.ToolTip = "缩小 (-)";
            zoomOutBtn.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                SetZoom(_scale / 1.25);
            };

            _zoomPctText = new TextBlock
            {
                Text = "100%",
                FontFamily = monoFont,
                FontSize = 11,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(226, 226, 234)),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center
            };
            var zoomResetBtn = new Border
            {
                Height = 22,
                MinWidth = 44,
                Padding = new Thickness(6, 0, 6, 0),
                CornerRadius = new CornerRadius(6),
                Background = System.Windows.Media.Brushes.Transparent,
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = "还原 100% (0)",
                Child = _zoomPctText
            };
            zoomResetBtn.MouseEnter += delegate { zoomResetBtn.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(220, 56, 62, 82)); };
            zoomResetBtn.MouseLeave += delegate { zoomResetBtn.Background = System.Windows.Media.Brushes.Transparent; };
            zoomResetBtn.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                SetZoom(1.0);
            };

            var zoomInBtn = MakePillButton(
                "+",
                uiFont,
                13,
                FontWeights.SemiBold,
                System.Windows.Media.Color.FromArgb(0, 0, 0, 0),
                System.Windows.Media.Color.FromArgb(220, 56, 62, 82),
                System.Windows.Media.Color.FromArgb(0, 0, 0, 0),
                System.Windows.Media.Color.FromRgb(226, 226, 234),
                6,
                new Thickness(0)
            );
            zoomInBtn.Width = 24;
            zoomInBtn.Height = 22;
            zoomInBtn.ToolTip = "放大 (+)";
            zoomInBtn.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                SetZoom(_scale * 1.25);
            };

            var zoomRow = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            zoomRow.Children.Add(zoomOutBtn);
            zoomRow.Children.Add(zoomResetBtn);
            zoomRow.Children.Add(zoomInBtn);

            var zoomCapsule = new Border
            {
                CornerRadius = new CornerRadius(8),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(20, 22, 30)),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(30, 255, 255, 255)),
                Padding = new Thickness(2),
                Margin = new Thickness(10, 0, 10, 0),
                Child = zoomRow
            };

            var openFileBtn = MakePillButton(
                "打开文件",
                uiFont,
                11.5,
                FontWeights.Medium,
                System.Windows.Media.Color.FromRgb(38, 42, 56),
                System.Windows.Media.Color.FromRgb(52, 58, 76),
                System.Windows.Media.Color.FromArgb(46, 255, 255, 255),
                System.Windows.Media.Color.FromRgb(234, 233, 240),
                12,
                new Thickness(11, 4, 11, 4)
            );
            openFileBtn.ToolTip = "使用系统默认程序打开图片";
            openFileBtn.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                OpenTargetFile();
            };

            var openFolderBtn = MakePillButton(
                "打开所在位置 ↗",
                uiFont,
                11.5,
                FontWeights.SemiBold,
                System.Windows.Media.Color.FromRgb(28, 74, 56),
                System.Windows.Media.Color.FromRgb(36, 98, 74),
                System.Windows.Media.Color.FromArgb(145, 66, 198, 138),
                System.Windows.Media.Color.FromRgb(118, 245, 184),
                12,
                new Thickness(12, 4, 12, 4)
            );
            openFolderBtn.Margin = new Thickness(7, 0, 0, 0);
            openFolderBtn.ToolTip = "在文件管理器中定位并选中该文件";
            openFolderBtn.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                OpenTargetFolder();
            };

            var barStack = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            barStack.Children.Add(_nameText);
            barStack.Children.Add(_dimText);
            barStack.Children.Add(zoomCapsule);
            barStack.Children.Add(openFileBtn);
            barStack.Children.Add(openFolderBtn);

            var bottomBar = new Border
            {
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(20, 0, 20, 20),
                Padding = new Thickness(12, 6, 10, 6),
                CornerRadius = new CornerRadius(14),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(245, 26, 29, 40)),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(46, 255, 255, 255)),
                Effect = new DropShadowEffect
                {
                    BlurRadius = 22,
                    ShadowDepth = 4,
                    Opacity = 0.65,
                    Color = Colors.Black
                },
                Child = barStack
            };
            bottomBar.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { e.Handled = true; };

            var rootGrid = new Grid();
            rootGrid.Children.Add(_stageGrid);
            rootGrid.Children.Add(bottomBar);
            rootGrid.Children.Add(closeBtn);

            _rootFrame = new Border
            {
                CornerRadius = new CornerRadius(10),
                ClipToBounds = true,
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(236, 15, 17, 24)),
                LayoutTransform = _rootScale,
                Child = rootGrid
            };
            _rootFrame.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e)
            {
                if (e.OriginalSource == _rootFrame || e.OriginalSource == rootGrid)
                {
                    e.Handled = true;
                    Close();
                }
            };

            Content = _rootFrame;

            PreviewMouseWheel += OnLightboxMouseWheel;
            PreviewKeyDown += OnLightboxKeyDown;

            SourceInitialized += delegate
            {
                _hwnd = new WindowInteropHelper(this).Handle;
                long ex = Native.GetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE);
                ex |= Native.WS_EX_TOOLWINDOW;
                Native.SetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE, ex);
                if (_ownerHwnd != IntPtr.Zero && Native.IsWindow(_ownerHwnd))
                {
                    Native.SetWindowLongPtrCompat(_hwnd, Native.GWLP_HWNDPARENT, _ownerHwnd.ToInt64());
                }
            };
            Closed += delegate
            {
                try { _image.Source = null; } catch { }
                Native.TrimWorkingSet();
            };
        }

        private static Border MakePillButton(
            string text,
            System.Windows.Media.FontFamily font,
            double fontSize,
            FontWeight weight,
            System.Windows.Media.Color bg,
            System.Windows.Media.Color hoverBg,
            System.Windows.Media.Color border,
            System.Windows.Media.Color fg,
            double radius,
            Thickness padding)
        {
            var tb = new TextBlock
            {
                Text = text,
                FontFamily = font,
                FontSize = fontSize,
                FontWeight = weight,
                Foreground = new SolidColorBrush(fg),
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            var normalBrush = new SolidColorBrush(bg);
            var hoverBrush = new SolidColorBrush(hoverBg);
            var btn = new Border
            {
                CornerRadius = new CornerRadius(radius),
                Background = normalBrush,
                BorderThickness = border.A > 0 ? new Thickness(1) : new Thickness(0),
                BorderBrush = new SolidColorBrush(border),
                Padding = padding,
                Cursor = System.Windows.Input.Cursors.Hand,
                Child = tb
            };
            btn.MouseEnter += delegate { btn.Background = hoverBrush; };
            btn.MouseLeave += delegate { btn.Background = normalBrush; };
            return btn;
        }

        public bool LoadImage(string filePath, string label)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return false;
            try
            {
                var fi = new FileInfo(filePath);
                if (fi.Length == 0 || fi.Length > 15 * 1024 * 1024) return false;
                const int maxLightboxWidth = 3840;
                int srcWidth;
                int srcHeight;
                bool probed = BitmapUtil.TryProbeImageDimensions(filePath, out srcWidth, out srcHeight);
                int targetDecodeWidth = probed ? Math.Min(srcWidth, maxLightboxWidth) : maxLightboxWidth;
                BitmapImage bmp = new BitmapImage();
                using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
                    if (!probed || srcWidth > maxLightboxWidth)
                    {
                        bmp.DecodePixelWidth = targetDecodeWidth;
                    }
                    bmp.StreamSource = fs;
                    bmp.EndInit();
                }
                bmp.Freeze();
                _filePath = filePath;
                _image.Source = bmp;
                _nameText.Text = string.IsNullOrEmpty(label) ? System.IO.Path.GetFileName(filePath) : label;
                _nameText.ToolTip = filePath;
                _dimText.Text = string.Format("{0}×{1}", bmp.PixelWidth, bmp.PixelHeight);
                SetZoom(1.0);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public void PositionOverBounds(Native.RECT winRect, double dpiScale, bool isMaximized, int radius)
        {
            PositionOverBounds(winRect, dpiScale, isMaximized, radius, false);
        }

        public void PositionOverBounds(Native.RECT winRect, double dpiScale, bool isMaximized, int radius, bool noActivate)
        {
            double safeScale = Math.Max(0.5, dpiScale);
            int physW = Math.Max(320, winRect.Right - winRect.Left);
            int physH = Math.Max(240, winRect.Bottom - winRect.Top);

            if (noActivate &&
                _hwnd != IntPtr.Zero &&
                winRect.Left == _lastBoundsLeft &&
                winRect.Top == _lastBoundsTop &&
                physW == _lastBoundsW &&
                physH == _lastBoundsH &&
                Math.Abs(safeScale - _lastBoundsDpi) < 0.01 &&
                isMaximized == _lastBoundsMax &&
                radius == _lastBoundsRadius)
            {
                return;
            }

            double wpfDpiX = 1.0;
            double wpfDpiY = 1.0;
            try
            {
                PresentationSource src = PresentationSource.FromVisual(this);
                if (src != null && src.CompositionTarget != null)
                {
                    Matrix m = src.CompositionTarget.TransformToDevice;
                    if (m.M11 > 0.1) wpfDpiX = m.M11;
                    if (m.M22 > 0.1) wpfDpiY = m.M22;
                }
            }
            catch { }

            double relX = safeScale / wpfDpiX;
            double relY = safeScale / wpfDpiY;
            _rootScale.ScaleX = relX;
            _rootScale.ScaleY = relY;

            double logicalDipW = physW / safeScale;
            double logicalDipH = physH / safeScale;

            _rootFrame.CornerRadius = isMaximized ? new CornerRadius(0) : new CornerRadius(Math.Max(0, Math.Min(18, radius)));
            _image.MaxWidth = Math.Max(180.0, logicalDipW - 96.0);
            _image.MaxHeight = Math.Max(120.0, logicalDipH - 136.0);

            Left = winRect.Left / wpfDpiX;
            Top = winRect.Top / wpfDpiY;
            Width = physW / wpfDpiX;
            Height = physH / wpfDpiY;

            if (_hwnd != IntPtr.Zero && Native.IsWindow(_hwnd))
            {
                uint flags = Native.SWP_NOZORDER | Native.SWP_SHOWWINDOW;
                if (noActivate) flags |= Native.SWP_NOACTIVATE;
                Native.SetWindowPos(_hwnd, IntPtr.Zero, winRect.Left, winRect.Top, physW, physH, flags);
            }

            _lastBoundsLeft = winRect.Left;
            _lastBoundsTop = winRect.Top;
            _lastBoundsW = physW;
            _lastBoundsH = physH;
            _lastBoundsDpi = safeScale;
            _lastBoundsMax = isMaximized;
            _lastBoundsRadius = radius;
        }

        private void SetZoom(double nextScale)
        {
            _scale = Math.Max(0.25, Math.Min(5.0, nextScale));
            if (_scale <= 1.02)
            {
                _translateTransform.X = 0.0;
                _translateTransform.Y = 0.0;
                _imageFrame.Cursor = System.Windows.Input.Cursors.Hand;
            }
            else
            {
                _imageFrame.Cursor = System.Windows.Input.Cursors.SizeAll;
            }
            _scaleTransform.ScaleX = _scale;
            _scaleTransform.ScaleY = _scale;
            _zoomPctText.Text = string.Format("{0}%", (int)Math.Round(_scale * 100.0));
        }

        private void OnLightboxMouseWheel(object sender, MouseWheelEventArgs e)
        {
            e.Handled = true;
            double factor = e.Delta > 0 ? 1.15 : (1.0 / 1.15);
            SetZoom(_scale * factor);
        }

        private void OnLightboxKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                e.Handled = true;
                Close();
            }
            else if (e.Key == Key.Add || e.Key == Key.OemPlus)
            {
                e.Handled = true;
                SetZoom(_scale * 1.25);
            }
            else if (e.Key == Key.Subtract || e.Key == Key.OemMinus)
            {
                e.Handled = true;
                SetZoom(_scale / 1.25);
            }
            else if (e.Key == Key.D0 || e.Key == Key.NumPad0)
            {
                e.Handled = true;
                SetZoom(1.0);
            }
        }

        private void OnImageMouseDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            if (e.ClickCount == 2)
            {
                SetZoom(_scale > 1.1 ? 1.0 : 2.0);
                return;
            }
            if (_scale > 1.02)
            {
                _dragging = true;
                _dragStart = e.GetPosition(this);
                _dragOriginX = _translateTransform.X;
                _dragOriginY = _translateTransform.Y;
                _imageFrame.CaptureMouse();
            }
        }

        private void OnImageMouseMove(object sender, System.Windows.Input.MouseEventArgs e)
        {
            if (!_dragging) return;
            System.Windows.Point cur = e.GetPosition(this);
            _translateTransform.X = _dragOriginX + (cur.X - _dragStart.X);
            _translateTransform.Y = _dragOriginY + (cur.Y - _dragStart.Y);
        }

        private void OnImageMouseUp(object sender, MouseButtonEventArgs e)
        {
            EndDrag();
        }

        private void EndDrag()
        {
            if (!_dragging) return;
            _dragging = false;
            try { _imageFrame.ReleaseMouseCapture(); } catch { }
        }

        private void OpenTargetFile()
        {
            if (string.IsNullOrEmpty(_filePath) || !File.Exists(_filePath)) return;
            try
            {
                using (Process proc = Process.Start(new ProcessStartInfo(_filePath) { UseShellExecute = true }))
                {
                }
            }
            catch { }
        }

        private void OpenTargetFolder()
        {
            if (string.IsNullOrEmpty(_filePath)) return;
            try
            {
                string fullPath = System.IO.Path.GetFullPath(_filePath);
                if (File.Exists(fullPath))
                {
                    IntPtr pidl = IntPtr.Zero;
                    uint sfgaoOut = 0;
                    try
                    {
                        if (Native.SHParseDisplayName(fullPath, IntPtr.Zero, out pidl, 0, out sfgaoOut) == 0 && pidl != IntPtr.Zero)
                        {
                            if (Native.SHOpenFolderAndSelectItems(pidl, 0, IntPtr.Zero, 0) == 0)
                            {
                                return;
                            }
                        }
                    }
                    finally
                    {
                        if (pidl != IntPtr.Zero) Native.CoTaskMemFree(pidl);
                    }
                    using (Process proc = Process.Start("explorer.exe", "/select,\"" + fullPath + "\""))
                    {
                    }
                }
                else
                {
                    string parent = System.IO.Path.GetDirectoryName(fullPath);
                    if (!string.IsNullOrEmpty(parent) && Directory.Exists(parent))
                    {
                        using (Process proc = Process.Start("explorer.exe", "\"" + parent + "\""))
                        {
                        }
                    }
                }
            }
            catch { }
        }
    }

    internal sealed class HudOverlayWindow : Window
    {
        public const double DipWidth = 430.0;
        public const double DipHeight = 26.0;

        private readonly IntPtr _ownerHwnd;
        private readonly ScaleTransform _rootScale = new ScaleTransform(1.0, 1.0);
        private readonly Border _ringPill;
        private readonly System.Windows.Shapes.Ellipse _ringTrack;
        private readonly System.Windows.Shapes.Path _ringArc;
        private readonly TextBlock _pctText;
        private readonly Border _metaPill;
        private readonly TextBlock _metaText;
        private readonly Run _speedRun;
        private readonly Run _sep1Run;
        private readonly Run _cacheLblRun;
        private readonly Run _cacheValRun;
        private readonly Run _sep2Run;
        private readonly Run _modelRun;
        private readonly Border _emptyAnchorPill;

        private IntPtr _hwnd = IntPtr.Zero;
        private int _lastPercent = -1;
        private string _lastAccentHex = "";
        private double _lastRelScaleX = 1.0;
        private double _lastRelScaleY = 1.0;
        private double _availDip = 360.0;
        private bool _ringHovered = false;
        private HudDisplayConfig _display = new HudDisplayConfig();
        private string _speedStr = "-- tok/s";
        private string _cacheValStr = "--";
        private string _modelStr = "--";
        private int _lastMetaMask = -1;

        public event Action Clicked;
        public IntPtr Handle { get { return _hwnd; } }

        public HudOverlayWindow(IntPtr ownerHwnd)
        {
            _ownerHwnd = ownerHwnd;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = System.Windows.Media.Brushes.Transparent;
            ShowInTaskbar = false;
            ShowActivated = false;
            Focusable = false;
            ResizeMode = ResizeMode.NoResize;
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);
            TextOptions.SetTextRenderingMode(this, TextRenderingMode.ClearType);
            Left = -32000;
            Top = -32000;
            Width = DipWidth;
            Height = DipHeight;

            var uiFont = new System.Windows.Media.FontFamily("Segoe UI, Microsoft YaHei UI");

            // Left pill: bare 2-color ring when idle; hover reveals rounded pill with ring + "* %"
            _ringTrack = new System.Windows.Shapes.Ellipse
            {
                Width = 14,
                Height = 14,
                Stroke = new SolidColorBrush(System.Windows.Media.Color.FromArgb(72, 255, 255, 255)),
                StrokeThickness = 2.0,
                Fill = System.Windows.Media.Brushes.Transparent
            };

            _ringArc = new System.Windows.Shapes.Path
            {
                Stroke = new SolidColorBrush(System.Windows.Media.Color.FromRgb(91, 140, 255)),
                StrokeThickness = 2.0,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Fill = System.Windows.Media.Brushes.Transparent
            };

            var ringCanvas = new Grid
            {
                Width = 14,
                Height = 14,
                VerticalAlignment = VerticalAlignment.Center
            };
            ringCanvas.Children.Add(_ringTrack);
            ringCanvas.Children.Add(_ringArc);

            _pctText = new TextBlock
            {
                Text = "0%",
                FontFamily = uiFont,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(234, 233, 239)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(5, 0, 0, 0),
                Visibility = Visibility.Collapsed
            };

            var ringInner = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            ringInner.Children.Add(ringCanvas);
            ringInner.Children.Add(_pctText);

            _ringPill = new Border
            {
                Height = 22,
                CornerRadius = new CornerRadius(11),
                BorderThickness = new Thickness(1),
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = "点击选择底部显示项",
                Child = ringInner
            };
            ApplyRingHoverStyle(false);

            _ringPill.MouseEnter += delegate
            {
                ApplyRingHoverStyle(true);
            };
            _ringPill.MouseLeave += delegate
            {
                ApplyRingHoverStyle(false);
            };
            _ringPill.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                Action handler = Clicked;
                if (handler != null) handler();
            };

            // Right pill: single unified TextBlock with Run inlines so Latin & CJK share one exact typographic baseline
            // and CharacterEllipsis utilizes 100% of available width without clipping model IDs early.
            _speedRun = new Run("-- tok/s")
            {
                FontFamily = uiFont,
                FontSize = 11.0,
                FontWeight = FontWeights.Normal,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(226, 225, 232))
            };
            _sep1Run = new Run(" · ")
            {
                FontFamily = uiFont,
                FontSize = 11.0,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromArgb(110, 255, 255, 255))
            };
            _cacheLblRun = new Run("缓存 ")
            {
                FontFamily = uiFont,
                FontSize = 10.0,
                FontWeight = FontWeights.Normal,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(156, 216, 190))
            };
            _cacheValRun = new Run("--")
            {
                FontFamily = uiFont,
                FontSize = 11.0,
                FontWeight = FontWeights.Normal,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(184, 223, 207))
            };
            _sep2Run = new Run(" · ")
            {
                FontFamily = uiFont,
                FontSize = 11.0,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromArgb(110, 255, 255, 255))
            };
            _modelRun = new Run("--")
            {
                FontFamily = uiFont,
                FontSize = 11.0,
                FontWeight = FontWeights.Normal,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(182, 181, 192))
            };

            _metaText = new TextBlock
            {
                FontFamily = uiFont,
                FontSize = 11.0,
                FontWeight = FontWeights.Normal,
                VerticalAlignment = VerticalAlignment.Center,
                TextWrapping = TextWrapping.NoWrap,
                TextTrimming = TextTrimming.CharacterEllipsis
            };

            _metaPill = new Border
            {
                Height = 22,
                Margin = new Thickness(6, 0, 0, 0),
                Padding = new Thickness(8, 0, 8, 0),
                CornerRadius = new CornerRadius(11),
                BorderThickness = new Thickness(1),
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = "点击选择底部显示项",
                Child = _metaText
            };
            ApplyMetaHoverStyle(false);

            _metaPill.MouseEnter += delegate
            {
                ApplyMetaHoverStyle(true);
            };
            _metaPill.MouseLeave += delegate
            {
                ApplyMetaHoverStyle(false);
            };
            _metaPill.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                Action handler = Clicked;
                if (handler != null) handler();
            };

            // Minimal fallback button when user unchecks all 4 items so the popup remains reachable
            var emptyGlyph = new TextBlock
            {
                Text = "···",
                FontFamily = uiFont,
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(200, 200, 212)),
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            _emptyAnchorPill = new Border
            {
                Width = 22,
                Height = 22,
                CornerRadius = new CornerRadius(11),
                BorderThickness = new Thickness(1),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(180, 22, 24, 32)),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(44, 255, 255, 255)),
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = "点击选择底部显示项",
                Visibility = Visibility.Collapsed,
                Child = emptyGlyph
            };
            _emptyAnchorPill.MouseEnter += delegate
            {
                _emptyAnchorPill.Background = EmptyHoverBg;
                _emptyAnchorPill.BorderBrush = EmptyHoverBorder;
            };
            _emptyAnchorPill.MouseLeave += delegate
            {
                _emptyAnchorPill.Background = EmptyIdleBg;
                _emptyAnchorPill.BorderBrush = EmptyIdleBorder;
            };
            _emptyAnchorPill.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                Action handler = Clicked;
                if (handler != null) handler();
            };

            ApplyAvailableDipLayout();

            var row = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center
            };
            row.Children.Add(_ringPill);
            row.Children.Add(_metaPill);
            row.Children.Add(_emptyAnchorPill);

            // Outer Grid keeps Background = null so transparent left area is 100% click-through
            var root = new Grid
            {
                Width = DipWidth,
                Height = DipHeight,
                Background = null,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                LayoutTransform = _rootScale
            };
            root.Children.Add(row);
            Content = root;

            SourceInitialized += delegate
            {
                _hwnd = new WindowInteropHelper(this).Handle;
                long ex = Native.GetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE);
                ex |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW;
                Native.SetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE, ex);
                if (_ownerHwnd != IntPtr.Zero && Native.IsWindow(_ownerHwnd))
                {
                    Native.SetWindowLongPtrCompat(_hwnd, Native.GWLP_HWNDPARENT, _ownerHwnd.ToInt64());
                }
            };
        }

        private static SolidColorBrush FrozenBrush(byte a, byte r, byte g, byte b)
        {
            var br = new SolidColorBrush(System.Windows.Media.Color.FromArgb(a, r, g, b));
            br.Freeze();
            return br;
        }

        private static readonly SolidColorBrush RingHoverBg = FrozenBrush(228, 22, 24, 32);
        private static readonly SolidColorBrush RingHoverBorder = FrozenBrush(58, 255, 255, 255);
        private static readonly SolidColorBrush RingIdleBg = FrozenBrush(1, 20, 22, 29);
        private static readonly SolidColorBrush MetaHoverBg = FrozenBrush(232, 28, 31, 41);
        private static readonly SolidColorBrush MetaHoverBorder = FrozenBrush(68, 255, 255, 255);
        private static readonly SolidColorBrush MetaIdleBg = FrozenBrush(192, 19, 21, 28);
        private static readonly SolidColorBrush MetaIdleBorder = FrozenBrush(40, 255, 255, 255);
        private static readonly SolidColorBrush EmptyHoverBg = FrozenBrush(232, 32, 36, 48);
        private static readonly SolidColorBrush EmptyHoverBorder = FrozenBrush(72, 255, 255, 255);
        private static readonly SolidColorBrush EmptyIdleBg = FrozenBrush(180, 22, 24, 32);
        private static readonly SolidColorBrush EmptyIdleBorder = FrozenBrush(44, 255, 255, 255);
        private static readonly Typeface MetaTypeface = new Typeface(
            new System.Windows.Media.FontFamily("Segoe UI, Microsoft YaHei UI"),
            FontStyles.Normal,
            FontWeights.Normal,
            FontStretches.Normal);
        private System.Windows.Media.Color _lastArcColor = System.Windows.Media.Color.FromRgb(91, 140, 255);
        private double _speedDipW = 54.0;
        private double _cacheDipW = 46.0;
        private double _modelDipW = 96.0;

        private static double MeasureTextDipWidth(string text, double fontSize)
        {
            if (string.IsNullOrEmpty(text)) return 0.0;
            try
            {
#pragma warning disable 618
                var ft = new FormattedText(
                    text,
                    CultureInfo.CurrentUICulture,
                    System.Windows.FlowDirection.LeftToRight,
                    MetaTypeface,
                    fontSize,
                    System.Windows.Media.Brushes.White
                );
#pragma warning restore 618
                return Math.Ceiling(ft.WidthIncludingTrailingWhitespace);
            }
            catch
            {
                return Math.Ceiling(text.Length * fontSize * 0.62);
            }
        }

        private void ApplyRingHoverStyle(bool hovered)
        {
            _ringHovered = hovered;
            bool expandPct = hovered && _availDip >= 60.0;
            if (expandPct)
            {
                _ringPill.Background = RingHoverBg;
                _ringPill.BorderBrush = RingHoverBorder;
                _ringPill.Padding = new Thickness(6, 0, 7, 0);
                _pctText.Visibility = Visibility.Visible;
            }
            else if (hovered)
            {
                _ringPill.Background = RingHoverBg;
                _ringPill.BorderBrush = RingHoverBorder;
                _ringPill.Padding = new Thickness(3, 0, 3, 0);
                _pctText.Visibility = Visibility.Collapsed;
            }
            else
            {
                // Alpha = 1 keeps hover hit-testing responsive while appearing visually bare
                _ringPill.Background = RingIdleBg;
                _ringPill.BorderBrush = System.Windows.Media.Brushes.Transparent;
                _ringPill.Padding = new Thickness(3, 0, 3, 0);
                _pctText.Visibility = Visibility.Collapsed;
            }
            ApplyAvailableDipLayout();
        }

        private void ApplyMetaHoverStyle(bool hovered)
        {
            if (hovered)
            {
                _metaPill.Background = MetaHoverBg;
                _metaPill.BorderBrush = MetaHoverBorder;
            }
            else
            {
                _metaPill.Background = MetaIdleBg;
                _metaPill.BorderBrush = MetaIdleBorder;
            }
        }

        public void UpdateDisplay(HudDisplayConfig display)
        {
            _display = display != null ? display.Clone() : new HudDisplayConfig();
            ApplyAvailableDipLayout();
        }

        public void UpdateData(HudTelemetry data, string accentHex)
        {
            int pct = data != null ? Math.Max(0, Math.Min(999, data.percent)) : 0;
            string accent = string.IsNullOrEmpty(accentHex) ? "#5B8CFF" : accentHex;

            if (pct != _lastPercent || !string.Equals(accent, _lastAccentHex, StringComparison.OrdinalIgnoreCase))
            {
                _lastPercent = pct;
                _lastAccentHex = accent;
                _pctText.Text = string.Format("{0}%", pct);
                _ringPill.ToolTip = string.Format("上下文占用 {0}% · 点击选择底部显示项", pct);

                System.Windows.Media.Color arcColor;
                if (pct >= 90)
                {
                    arcColor = System.Windows.Media.Color.FromRgb(239, 83, 80);
                }
                else if (pct >= 75)
                {
                    arcColor = System.Windows.Media.Color.FromRgb(233, 147, 21);
                }
                else
                {
                    arcColor = ColorUtil.ParseHex(accent, System.Windows.Media.Color.FromRgb(91, 140, 255));
                }
                if (arcColor != _lastArcColor || _ringArc.Stroke == null)
                {
                    _lastArcColor = arcColor;
                    var frozenArc = new SolidColorBrush(arcColor);
                    frozenArc.Freeze();
                    _ringArc.Stroke = frozenArc;
                }
                _ringArc.Data = BuildArcGeometry(Math.Min(100, pct));
            }

            string nextSpeedStr;
            if (data != null && data.tokPerSec.HasValue && data.tokPerSec.Value > 0)
            {
                double val = data.tokPerSec.Value;
                string num = val >= 100
                    ? Math.Round(val).ToString("0", CultureInfo.InvariantCulture)
                    : val.ToString("0.0", CultureInfo.InvariantCulture);
                nextSpeedStr = num + " tok/s";
            }
            else
            {
                nextSpeedStr = "-- tok/s";
            }

            string nextCacheValStr;
            if (data != null && data.cacheHitPct.HasValue)
            {
                nextCacheValStr = string.Format("{0}%", Math.Max(0, Math.Min(100, data.cacheHitPct.Value)));
            }
            else
            {
                nextCacheValStr = "--";
            }

            string nextModelStr = (data != null && !string.IsNullOrEmpty(data.upstreamModelId))
                ? data.upstreamModelId
                : "--";

            bool widthsChanged = false;
            if (!string.Equals(nextSpeedStr, _speedStr, StringComparison.Ordinal))
            {
                _speedStr = nextSpeedStr;
                _speedRun.Text = _speedStr;
                _speedDipW = MeasureTextDipWidth(_speedStr, 11.0);
                widthsChanged = true;
            }
            if (!string.Equals(nextCacheValStr, _cacheValStr, StringComparison.Ordinal))
            {
                _cacheValStr = nextCacheValStr;
                _cacheValRun.Text = _cacheValStr;
                _cacheDipW = MeasureTextDipWidth("缓存 " + _cacheValStr, 11.0);
                widthsChanged = true;
            }
            if (!string.Equals(nextModelStr, _modelStr, StringComparison.Ordinal))
            {
                _modelStr = nextModelStr;
                _modelRun.Text = _modelStr;
                _modelDipW = MeasureTextDipWidth(_modelStr, 11.0);
                widthsChanged = true;
            }
            if (widthsChanged)
            {
                ApplyAvailableDipLayout();
            }
        }

        public bool ApplyDpiScale(double targetDpiScale, out int physW, out int physH)
        {
            double clampedTarget = Math.Max(0.75, Math.Min(3.5, targetDpiScale));
            double wpfDpiX = 1.0;
            double wpfDpiY = 1.0;
            try
            {
                PresentationSource src = PresentationSource.FromVisual(this);
                if (src != null && src.CompositionTarget != null)
                {
                    Matrix m = src.CompositionTarget.TransformToDevice;
                    if (m.M11 > 0.1) wpfDpiX = m.M11;
                    if (m.M22 > 0.1) wpfDpiY = m.M22;
                }
            }
            catch { }

            // Compensate for .NET 4.x WPF locking TransformToDevice to the primary monitor's DPI
            double relX = clampedTarget / wpfDpiX;
            double relY = clampedTarget / wpfDpiY;
            bool changed = Math.Abs(relX - _lastRelScaleX) > 0.01 || Math.Abs(relY - _lastRelScaleY) > 0.01;
            if (changed)
            {
                _lastRelScaleX = relX;
                _lastRelScaleY = relY;
                _rootScale.ScaleX = relX;
                _rootScale.ScaleY = relY;
                Width = DipWidth * relX;
                Height = DipHeight * relY;
                try { UpdateLayout(); } catch { }
            }

            physW = (int)Math.Ceiling(DipWidth * clampedTarget);
            physH = (int)Math.Ceiling(DipHeight * clampedTarget);
            return changed;
        }

        private void RebuildMetaInlines(bool showSpeed, bool showCache, bool showModel)
        {
            int mask = (showSpeed ? 1 : 0) | (showCache ? 2 : 0) | (showModel ? 4 : 0);
            if (mask == _lastMetaMask) return;
            _lastMetaMask = mask;
            _metaText.Inlines.Clear();
            bool hasPrev = false;
            if (showSpeed)
            {
                _metaText.Inlines.Add(_speedRun);
                hasPrev = true;
            }
            if (showCache)
            {
                if (hasPrev) _metaText.Inlines.Add(_sep1Run);
                _metaText.Inlines.Add(_cacheLblRun);
                _metaText.Inlines.Add(_cacheValRun);
                hasPrev = true;
            }
            if (showModel)
            {
                if (hasPrev) _metaText.Inlines.Add(_sep2Run);
                _metaText.Inlines.Add(_modelRun);
            }
        }

        private void ApplyAvailableDipLayout()
        {
            if (_metaPill == null || _metaText == null || _ringPill == null || _emptyAnchorPill == null) return;

            bool wantContext = _display.showContext;
            bool wantSpeed = _display.showSpeed;
            bool wantCache = _display.showCacheHit;
            bool wantModel = _display.showModel;
            bool anyEnabled = wantContext || wantSpeed || wantCache || wantModel;

            _ringPill.Visibility = wantContext ? Visibility.Visible : Visibility.Collapsed;
            _metaPill.Margin = wantContext ? new Thickness(5, 0, 0, 0) : new Thickness(0);

            // Keep hover pct pill from overflowing into left controls on narrow composers
            if (_ringHovered)
            {
                bool expandPct = _availDip >= 60.0;
                _pctText.Visibility = expandPct ? Visibility.Visible : Visibility.Collapsed;
                _ringPill.Padding = expandPct ? new Thickness(6, 0, 7, 0) : new Thickness(3, 0, 3, 0);
            }

            if (!wantSpeed && !wantCache && !wantModel)
            {
                _emptyAnchorPill.Visibility = anyEnabled ? Visibility.Collapsed : Visibility.Visible;
                if (_metaPill.Visibility != Visibility.Collapsed)
                {
                    _metaPill.Visibility = Visibility.Collapsed;
                }
                return;
            }

            // Progressive width-based compression:
            // 1) Full enabled items (mildly trim long model ID only if >= 76 DIP remains for model)
            // 2) Drop long model ID completely before chopping speed/cache
            // 3) Drop cache hit if speed + cache cannot both fit cleanly
            // 4) Collapse meta pill entirely -> keep only compact Context Ring (or '...' anchor if ring disabled)
            bool expandedRing = wantContext && _ringHovered && _availDip >= 60.0;
            double ringBudget = wantContext ? (expandedRing ? 58.0 : 21.0) : 0.0;
            double metaAvail = _availDip - ringBudget - (wantContext ? 5.0 : 0.0);
            const double pillChromeDip = 19.0; // 8+8 padding + 1+1 border + 1px safety
            const double sepDip = 11.0;        // " · "
            double textBudget = metaAvail - pillChromeDip;

            bool showSpeed = wantSpeed;
            bool showCache = wantCache;
            bool showModel = wantModel;

            // Step 1: Drop model ID completely if the full model ID cannot fit cleanly (never clip into "gemini-4-neo")
            if (showModel)
            {
                double baseWithoutModel =
                    (showSpeed ? _speedDipW : 0.0) +
                    (showCache ? _cacheDipW : 0.0) +
                    (showSpeed && showCache ? sepDip : 0.0);
                double needBeforeModel = baseWithoutModel + (baseWithoutModel > 0.0 ? sepDip : 0.0);
                double modelRem = textBudget - needBeforeModel;
                double minModelDip = _modelDipW + 2.0;
                if (modelRem < minModelDip)
                {
                    showModel = false;
                }
            }

            // Step 2: Drop cache hit if speed + cache exceed budget
            if (showSpeed && showCache && (_speedDipW + sepDip + _cacheDipW) > textBudget + 1.0)
            {
                showCache = false;
            }

            // Step 3: Never leave half-chopped speed ("99.6 tok/...") or cache ("缓...") — drop completely if it doesn't fit whole
            if (showSpeed && !showCache && !showModel && _speedDipW > textBudget + 1.0)
            {
                showSpeed = false;
            }
            if (!showSpeed && showCache && !showModel && _cacheDipW > textBudget + 1.0)
            {
                showCache = false;
            }

            if (!showSpeed && !showCache && !showModel)
            {
                if (_metaPill.Visibility != Visibility.Collapsed)
                {
                    _metaPill.Visibility = Visibility.Collapsed;
                }
                _emptyAnchorPill.Visibility = wantContext ? Visibility.Collapsed : Visibility.Visible;
                return;
            }

            _emptyAnchorPill.Visibility = Visibility.Collapsed;
            if (_metaPill.Visibility != Visibility.Visible)
            {
                _metaPill.Visibility = Visibility.Visible;
            }

            RebuildMetaInlines(showSpeed, showCache, showModel);
            double nextMax = Math.Max(28.0, Math.Min(390.0, Math.Floor(textBudget)));
            if (Math.Abs(_metaText.MaxWidth - nextMax) >= 1.5)
            {
                _metaText.MaxWidth = nextMax;
            }
        }

        public void SetAvailableDipWidth(double availDip)
        {
            _availDip = availDip;
            ApplyAvailableDipLayout();
        }

        private static Geometry BuildArcGeometry(int pct)
        {
            if (pct <= 0) return Geometry.Empty;
            const double cx = 7.0;
            const double cy = 7.0;
            const double r = 6.0;

            if (pct >= 100)
            {
                var full = new EllipseGeometry(new System.Windows.Point(cx, cy), r, r);
                full.Freeze();
                return full;
            }

            double clampedPct = Math.Max(2.0, Math.Min(99.5, (double)pct));
            double angleRad = (clampedPct / 100.0) * Math.PI * 2.0;
            double startX = cx;
            double startY = cy - r;
            double endX = cx + r * Math.Sin(angleRad);
            double endY = cy - r * Math.Cos(angleRad);
            bool isLargeArc = clampedPct > 50.0;

            var geom = new StreamGeometry();
            using (StreamGeometryContext ctx = geom.Open())
            {
                ctx.BeginFigure(new System.Windows.Point(startX, startY), false, false);
                ctx.ArcTo(
                    new System.Windows.Point(endX, endY),
                    new System.Windows.Size(r, r),
                    0.0,
                    isLargeArc,
                    SweepDirection.Clockwise,
                    true,
                    false
                );
            }
            geom.Freeze();
            return geom;
        }
    }

    internal sealed class HudGuidePreviewWindow : Window
    {
        public const double CardDipWidth = 308.0;
        public const double CardDipHeight = 204.0;
        private const double ShadowPadDip = 10.0;
        private const double TotalDipWidth = CardDipWidth + ShadowPadDip * 2.0;
        private const double TotalDipHeight = CardDipHeight + ShadowPadDip * 2.0;

        private readonly IntPtr _ownerHwnd;
        private readonly ScaleTransform _rootScale = new ScaleTransform(1.0, 1.0);
        private IntPtr _hwnd = IntPtr.Zero;
        private bool _closingStarted = false;

        public IntPtr Handle { get { return _hwnd; } }

        public HudGuidePreviewWindow(IntPtr ownerHwnd, BitmapSource guideBitmap)
        {
            _ownerHwnd = ownerHwnd;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = System.Windows.Media.Brushes.Transparent;
            ShowInTaskbar = false;
            ShowActivated = false;
            Focusable = false;
            IsHitTestVisible = false;
            ResizeMode = ResizeMode.NoResize;
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);
            TextOptions.SetTextRenderingMode(this, TextRenderingMode.ClearType);
            Width = TotalDipWidth;
            Height = TotalDipHeight;

            var uiFont = new System.Windows.Media.FontFamily("Segoe UI, Microsoft YaHei UI");
            var caption = new TextBlock
            {
                Text = "打开方式：右上角 Plugins → AGY 控制台",
                FontFamily = uiFont,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(218, 224, 242)),
                Margin = new Thickness(2, 0, 2, 7)
            };

            var imgFill = new ImageBrush(guideBitmap)
            {
                Stretch = Stretch.UniformToFill,
                AlignmentX = AlignmentX.Center,
                AlignmentY = AlignmentY.Center
            };
            RenderOptions.SetBitmapScalingMode(imgFill, BitmapScalingMode.HighQuality);

            var imgFrame = new Border
            {
                Width = 290,
                Height = 162,
                CornerRadius = new CornerRadius(8),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(40, 255, 255, 255)),
                Background = imgFill
            };

            var stack = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Vertical
            };
            stack.Children.Add(caption);
            stack.Children.Add(imgFrame);

            var card = new Border
            {
                Width = CardDipWidth,
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(8, 8, 8, 8),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(250, 20, 22, 31)),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(48, 255, 255, 255)),
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(ShadowPadDip),
                Effect = new DropShadowEffect
                {
                    BlurRadius = 18,
                    ShadowDepth = 4,
                    Opacity = 0.66,
                    Color = Colors.Black
                },
                Child = stack
            };

            var root = new Grid
            {
                Width = TotalDipWidth,
                Height = TotalDipHeight,
                Background = System.Windows.Media.Brushes.Transparent,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                LayoutTransform = _rootScale
            };
            root.Children.Add(card);
            Content = root;

            SourceInitialized += delegate
            {
                _hwnd = new WindowInteropHelper(this).Handle;
                long ex = Native.GetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE);
                ex |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW | Native.WS_EX_TRANSPARENT;
                Native.SetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE, ex);
                if (_ownerHwnd != IntPtr.Zero && Native.IsWindow(_ownerHwnd))
                {
                    Native.SetWindowLongPtrCompat(_hwnd, Native.GWLP_HWNDPARENT, _ownerHwnd.ToInt64());
                }
            };
        }

        public void PositionBesidePopup(
            Native.RECT hostWinRect,
            int popCardLeftPx,
            int popCardRightPx,
            int popCardBottomPx,
            double dpiScale)
        {
            double safeScale = Math.Max(0.75, Math.Min(3.5, dpiScale));
            double wpfDpiX = 1.0;
            double wpfDpiY = 1.0;
            try
            {
                PresentationSource src = PresentationSource.FromVisual(this);
                if (src != null && src.CompositionTarget != null)
                {
                    Matrix m = src.CompositionTarget.TransformToDevice;
                    if (m.M11 > 0.1) wpfDpiX = m.M11;
                    if (m.M22 > 0.1) wpfDpiY = m.M22;
                }
            }
            catch { }

            _rootScale.ScaleX = safeScale / wpfDpiX;
            _rootScale.ScaleY = safeScale / wpfDpiY;

            int physW = (int)Math.Ceiling(TotalDipWidth * safeScale);
            int physH = (int)Math.Ceiling(TotalDipHeight * safeScale);
            int padPx = (int)Math.Round(ShadowPadDip * safeScale);
            int cardW = physW - padPx * 2;
            int gapPx = (int)Math.Round(6.0 * safeScale);

            int boundLeft = hostWinRect.Left + (int)Math.Round(6.0 * safeScale);
            int boundRight = hostWinRect.Right - (int)Math.Round(6.0 * safeScale);
            int boundTop = hostWinRect.Top + (int)Math.Round(32.0 * safeScale);
            int boundBottom = hostWinRect.Bottom - (int)Math.Round(6.0 * safeScale);
            try
            {
                System.Drawing.Rectangle wa = Screen.FromPoint(new System.Drawing.Point(popCardRightPx, popCardBottomPx)).WorkingArea;
                if (wa.Width > 0 && wa.Height > 0)
                {
                    boundLeft = Math.Max(boundLeft, wa.Left + 4);
                    boundRight = Math.Min(boundRight, wa.Right - 4);
                    boundTop = Math.Max(boundTop, wa.Top + 4);
                    boundBottom = Math.Min(boundBottom, wa.Bottom - 4);
                }
            }
            catch { }

            // Prefer popping to the right of the main popover; auto-flip left if right side is tight
            int cardLeft = popCardRightPx + gapPx;
            if (cardLeft + cardW > boundRight)
            {
                int leftCandidate = popCardLeftPx - gapPx - cardW;
                if (leftCandidate >= boundLeft)
                {
                    cardLeft = leftCandidate;
                }
                else
                {
                    cardLeft = Math.Max(boundLeft, boundRight - cardW);
                }
            }

            int x = cardLeft - padPx;
            int y = popCardBottomPx - (physH - padPx);
            int minY = boundTop - padPx;
            int maxY = boundBottom - (physH - padPx);
            if (maxY >= minY)
            {
                if (y < minY) y = minY;
                if (y > maxY) y = maxY;
            }

            Left = x / wpfDpiX;
            Top = y / wpfDpiY;
            Width = physW / wpfDpiX;
            Height = physH / wpfDpiY;

            if (_hwnd != IntPtr.Zero && Native.IsWindow(_hwnd))
            {
                Native.SetWindowPos(_hwnd, IntPtr.Zero, x, y, physW, physH, Native.SWP_NOACTIVATE | Native.SWP_NOZORDER | Native.SWP_SHOWWINDOW);
            }
        }

        public void SafeClose()
        {
            if (_closingStarted) return;
            _closingStarted = true;
            try { Close(); } catch { }
        }
    }

    internal sealed class HudConfigPopupWindow : Window
    {
        public const double CardDipWidth = 248.0;
        public const double CardDipHeight = 204.0;
        private const double ShadowPadDip = 10.0;
        private const double TotalDipWidth = CardDipWidth + ShadowPadDip * 2.0;
        private const double TotalDipHeight = CardDipHeight + ShadowPadDip * 2.0;

        private sealed class ToggleRowControls
        {
            public Border CheckBox;
            public System.Windows.Shapes.Path CheckMark;
            public TextBlock ValueText;
        }

        private readonly IntPtr _ownerHwnd;
        private readonly string _guideImagePath;
        private readonly ScaleTransform _rootScale = new ScaleTransform(1.0, 1.0);
        private readonly TextBlock _headerPctBadge;
        private readonly ToggleRowControls _speedRow;
        private readonly ToggleRowControls _cacheRow;
        private readonly ToggleRowControls _modelRow;
        private readonly ToggleRowControls _contextRow;

        private IntPtr _hwnd = IntPtr.Zero;
        private HudDisplayConfig _display = new HudDisplayConfig();
        private System.Windows.Media.Color _accentColor = System.Windows.Media.Color.FromRgb(91, 140, 255);
        private bool _closingStarted = false;
        private HudGuidePreviewWindow _guidePreview = null;
        private BitmapSource _guideBitmap = null;
        private bool _guidePinned = false;
        private Native.RECT _lastHostWinRect;
        private int _lastCardLeftPx = 0;
        private int _lastCardRightPx = 0;
        private int _lastCardBottomPx = 0;
        private double _lastDpiScale = 1.0;

        public event Action<HudDisplayConfig> DisplayChanged;
        public IntPtr Handle { get { return _hwnd; } }
        public Window GuideWindow { get { return _guidePreview; } }

        public HudConfigPopupWindow(IntPtr ownerHwnd, string guideImagePath)
        {
            _ownerHwnd = ownerHwnd;
            _guideImagePath = guideImagePath ?? "";
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = System.Windows.Media.Brushes.Transparent;
            ShowInTaskbar = false;
            // Non-activating owned popup: NEVER steals foreground focus from Antigravity or pulls background apps (like OBS) forward on close!
            ShowActivated = false;
            Focusable = false;
            ResizeMode = ResizeMode.NoResize;
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);
            TextOptions.SetTextRenderingMode(this, TextRenderingMode.ClearType);
            Width = TotalDipWidth;
            Height = TotalDipHeight;

            var uiFont = new System.Windows.Media.FontFamily("Segoe UI, Microsoft YaHei UI");
            var monoFont = new System.Windows.Media.FontFamily("Consolas, Segoe UI, Microsoft YaHei UI");

            var titleText = new TextBlock
            {
                Text = "底部状态栏显示",
                FontFamily = uiFont,
                FontSize = 11.5,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(224, 224, 234)),
                VerticalAlignment = VerticalAlignment.Center
            };

            _headerPctBadge = new TextBlock
            {
                Text = "0%",
                FontFamily = monoFont,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(158, 192, 255)),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Right
            };

            var headerGrid = new Grid
            {
                Margin = new Thickness(6, 2, 6, 6)
            };
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(titleText, 0);
            Grid.SetColumn(_headerPctBadge, 1);
            headerGrid.Children.Add(titleText);
            headerGrid.Children.Add(_headerPctBadge);

            var topDivider = new Border
            {
                Height = 1,
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(22, 255, 255, 255)),
                Margin = new Thickness(4, 0, 4, 4)
            };

            Border speedBorder = CreateToggleRow("生成速率", uiFont, monoFont, out _speedRow, delegate
            {
                _display.showSpeed = !_display.showSpeed;
                EmitDisplayChanged();
            });
            Border cacheBorder = CreateToggleRow("缓存命中", uiFont, monoFont, out _cacheRow, delegate
            {
                _display.showCacheHit = !_display.showCacheHit;
                EmitDisplayChanged();
            });
            Border modelBorder = CreateToggleRow("上游模型", uiFont, monoFont, out _modelRow, delegate
            {
                _display.showModel = !_display.showModel;
                EmitDisplayChanged();
            });
            Border contextBorder = CreateToggleRow("上下文占用", uiFont, monoFont, out _contextRow, delegate
            {
                _display.showContext = !_display.showContext;
                EmitDisplayChanged();
            });

            var guideDivider = new Border
            {
                Height = 1,
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(22, 255, 255, 255)),
                Margin = new Thickness(4, 4, 4, 5)
            };

            var guideQBadge = new Border
            {
                Width = 15,
                Height = 15,
                CornerRadius = new CornerRadius(8),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(28, 255, 255, 255)),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock
                {
                    Text = "?",
                    FontFamily = uiFont,
                    FontSize = 10,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(186, 198, 228)),
                    HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                }
            };
            var guideLabel = new TextBlock
            {
                Text = "如何打开 AGY 控制台",
                FontFamily = uiFont,
                FontSize = 11.5,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(186, 194, 214)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0)
            };
            var guideLeft = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            guideLeft.Children.Add(guideQBadge);
            guideLeft.Children.Add(guideLabel);

            var guideArrow = new TextBlock
            {
                Text = "▸",
                FontFamily = uiFont,
                FontSize = 11,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(144, 152, 178)),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Right
            };
            var guideGrid = new Grid();
            guideGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            guideGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            Grid.SetColumn(guideLeft, 0);
            Grid.SetColumn(guideArrow, 1);
            guideGrid.Children.Add(guideLeft);
            guideGrid.Children.Add(guideArrow);

            var guideNormalBg = new SolidColorBrush(System.Windows.Media.Color.FromArgb(12, 255, 255, 255));
            var guideHoverBg = new SolidColorBrush(System.Windows.Media.Color.FromArgb(28, 255, 255, 255));
            var guideNormalFg = new SolidColorBrush(System.Windows.Media.Color.FromRgb(186, 194, 214));
            var guideHoverFg = new SolidColorBrush(System.Windows.Media.Color.FromRgb(240, 244, 255));
            var guideRow = new Border
            {
                Height = 26,
                Padding = new Thickness(6, 0, 7, 0),
                CornerRadius = new CornerRadius(7),
                Background = guideNormalBg,
                Cursor = System.Windows.Input.Cursors.Hand,
                Child = guideGrid
            };
            guideRow.MouseEnter += delegate
            {
                guideRow.Background = guideHoverBg;
                guideLabel.Foreground = guideHoverFg;
                guideArrow.Foreground = guideHoverFg;
                ShowGuidePreview();
            };
            guideRow.MouseLeave += delegate
            {
                if (!_guidePinned)
                {
                    guideRow.Background = guideNormalBg;
                    guideLabel.Foreground = guideNormalFg;
                    guideArrow.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(144, 152, 178));
                    HideGuidePreview();
                }
            };
            guideRow.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                _guidePinned = !_guidePinned;
                if (_guidePinned)
                {
                    guideRow.Background = guideHoverBg;
                    guideLabel.Foreground = guideHoverFg;
                    ShowGuidePreview();
                }
                else
                {
                    guideRow.Background = guideNormalBg;
                    guideLabel.Foreground = guideNormalFg;
                    HideGuidePreview();
                }
            };

            var contentStack = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Vertical
            };
            contentStack.Children.Add(headerGrid);
            contentStack.Children.Add(topDivider);
            contentStack.Children.Add(speedBorder);
            contentStack.Children.Add(cacheBorder);
            contentStack.Children.Add(modelBorder);
            contentStack.Children.Add(contextBorder);
            contentStack.Children.Add(guideDivider);
            contentStack.Children.Add(guideRow);

            var card = new Border
            {
                Width = CardDipWidth,
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(8, 8, 8, 8),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(247, 22, 24, 33)),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(42, 255, 255, 255)),
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(ShadowPadDip),
                Effect = new DropShadowEffect
                {
                    BlurRadius = 18,
                    ShadowDepth = 4,
                    Opacity = 0.62,
                    Color = Colors.Black
                },
                Child = contentStack
            };

            var root = new Grid
            {
                Width = TotalDipWidth,
                Height = TotalDipHeight,
                Background = System.Windows.Media.Brushes.Transparent,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                LayoutTransform = _rootScale
            };
            root.Children.Add(card);
            Content = root;

            SourceInitialized += delegate
            {
                _hwnd = new WindowInteropHelper(this).Handle;
                long ex = Native.GetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE);
                ex |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW;
                Native.SetWindowLongPtrCompat(_hwnd, Native.GWL_EXSTYLE, ex);
                if (_ownerHwnd != IntPtr.Zero && Native.IsWindow(_ownerHwnd))
                {
                    Native.SetWindowLongPtrCompat(_hwnd, Native.GWLP_HWNDPARENT, _ownerHwnd.ToInt64());
                }
                HwndSource src = HwndSource.FromHwnd(_hwnd);
                if (src != null)
                {
                    src.AddHook(PopupWndProc);
                }
            };
            Closed += delegate
            {
                HideGuidePreview();
            };
        }

        private BitmapSource EnsureGuideBitmap()
        {
            if (_guideBitmap != null) return _guideBitmap;
            if (string.IsNullOrEmpty(_guideImagePath) || !File.Exists(_guideImagePath)) return null;
            try
            {
                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.UriSource = new Uri(_guideImagePath, UriKind.Absolute);
                bi.EndInit();
                bi.Freeze();
                _guideBitmap = bi;
            }
            catch { }
            return _guideBitmap;
        }

        private void ShowGuidePreview()
        {
            if (_closingStarted) return;
            BitmapSource bmp = EnsureGuideBitmap();
            if (bmp == null) return;
            try
            {
                if (_guidePreview == null)
                {
                    _guidePreview = new HudGuidePreviewWindow(_ownerHwnd, bmp);
                    _guidePreview.PositionBesidePopup(_lastHostWinRect, _lastCardLeftPx, _lastCardRightPx, _lastCardBottomPx, _lastDpiScale);
                    _guidePreview.Show();
                    _guidePreview.PositionBesidePopup(_lastHostWinRect, _lastCardLeftPx, _lastCardRightPx, _lastCardBottomPx, _lastDpiScale);
                }
                else
                {
                    _guidePreview.PositionBesidePopup(_lastHostWinRect, _lastCardLeftPx, _lastCardRightPx, _lastCardBottomPx, _lastDpiScale);
                }
            }
            catch
            {
                HideGuidePreview();
            }
        }

        public void HideGuidePreview()
        {
            HudGuidePreviewWindow g = _guidePreview;
            _guidePreview = null;
            if (g != null)
            {
                g.SafeClose();
            }
        }

        private static IntPtr PopupWndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == 0x0021) // WM_MOUSEACTIVATE -> MA_NOACTIVATE (interactive clicks without stealing host focus)
            {
                handled = true;
                return new IntPtr(3);
            }
            return IntPtr.Zero;
        }

        private static Border CreateToggleRow(
            string label,
            System.Windows.Media.FontFamily uiFont,
            System.Windows.Media.FontFamily monoFont,
            out ToggleRowControls controls,
            Action onToggle)
        {
            var checkMark = new System.Windows.Shapes.Path
            {
                Data = Geometry.Parse("M 2.5,6.8 L 5.4,9.7 L 10.6,3.6"),
                Stroke = System.Windows.Media.Brushes.White,
                StrokeThickness = 1.8,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                StrokeLineJoin = PenLineJoin.Round,
                Visibility = Visibility.Visible
            };

            var checkBox = new Border
            {
                Width = 15,
                Height = 15,
                CornerRadius = new CornerRadius(4),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(74, 255, 255, 255)),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(91, 140, 255)),
                VerticalAlignment = VerticalAlignment.Center,
                Child = checkMark
            };

            var labelText = new TextBlock
            {
                Text = label,
                FontFamily = uiFont,
                FontSize = 12,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(234, 234, 242)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0)
            };

            var leftStack = new StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            leftStack.Children.Add(checkBox);
            leftStack.Children.Add(labelText);

            var valText = new TextBlock
            {
                Text = "--",
                FontFamily = monoFont,
                FontSize = 11,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(154, 156, 174)),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
                MaxWidth = 116,
                TextTrimming = TextTrimming.CharacterEllipsis
            };

            var rowGrid = new Grid();
            rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            Grid.SetColumn(leftStack, 0);
            Grid.SetColumn(valText, 1);
            rowGrid.Children.Add(leftStack);
            rowGrid.Children.Add(valText);

            var hoverBg = new SolidColorBrush(System.Windows.Media.Color.FromArgb(20, 255, 255, 255));
            var rowBorder = new Border
            {
                Height = 29,
                Padding = new Thickness(6, 0, 6, 0),
                CornerRadius = new CornerRadius(7),
                Background = System.Windows.Media.Brushes.Transparent,
                Cursor = System.Windows.Input.Cursors.Hand,
                Child = rowGrid
            };
            rowBorder.MouseEnter += delegate { rowBorder.Background = hoverBg; };
            rowBorder.MouseLeave += delegate { rowBorder.Background = System.Windows.Media.Brushes.Transparent; };
            rowBorder.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
            {
                e.Handled = true;
                if (onToggle != null) onToggle();
            };

            controls = new ToggleRowControls
            {
                CheckBox = checkBox,
                CheckMark = checkMark,
                ValueText = valText
            };
            return rowBorder;
        }

        private void EmitDisplayChanged()
        {
            ApplyCheckStyles();
            Action<HudDisplayConfig> handler = DisplayChanged;
            if (handler != null)
            {
                handler(_display.Clone());
            }
        }

        private void ApplyCheckStyles()
        {
            ApplySingleCheck(_speedRow, _display.showSpeed);
            ApplySingleCheck(_cacheRow, _display.showCacheHit);
            ApplySingleCheck(_modelRow, _display.showModel);
            ApplySingleCheck(_contextRow, _display.showContext);
        }

        private void ApplySingleCheck(ToggleRowControls row, bool isChecked)
        {
            if (row == null) return;
            if (isChecked)
            {
                row.CheckBox.Background = new SolidColorBrush(_accentColor);
                row.CheckBox.BorderBrush = System.Windows.Media.Brushes.Transparent;
                row.CheckMark.Visibility = Visibility.Visible;
            }
            else
            {
                row.CheckBox.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(14, 255, 255, 255));
                row.CheckBox.BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(74, 255, 255, 255));
                row.CheckMark.Visibility = Visibility.Collapsed;
            }
        }

        private static string FormatTokenK(long tokens)
        {
            long v = Math.Max(0L, tokens);
            if (v >= 1000000L)
            {
                double m = v / 1000000.0;
                return (Math.Abs(m - Math.Round(m)) < 0.05
                    ? Math.Round(m).ToString("0", CultureInfo.InvariantCulture)
                    : m.ToString("0.0", CultureInfo.InvariantCulture)) + "M";
            }
            if (v >= 1000L)
            {
                return Math.Round(v / 1000.0).ToString("0", CultureInfo.InvariantCulture) + "k";
            }
            return v.ToString(CultureInfo.InvariantCulture);
        }

        public void UpdateState(HudDisplayConfig display, HudTelemetry data, string accentHex)
        {
            _display = display != null ? display.Clone() : new HudDisplayConfig();
            _accentColor = ColorUtil.ParseHex(accentHex, System.Windows.Media.Color.FromRgb(91, 140, 255));

            int pct = data != null ? Math.Max(0, Math.Min(999, data.percent)) : 0;
            _headerPctBadge.Text = string.Format("{0}%", pct);
            if (pct >= 90)
            {
                _headerPctBadge.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(239, 83, 80));
            }
            else if (pct >= 75)
            {
                _headerPctBadge.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(233, 147, 21));
            }
            else
            {
                _headerPctBadge.Foreground = new SolidColorBrush(_accentColor);
            }

            if (data != null && data.tokPerSec.HasValue && data.tokPerSec.Value > 0)
            {
                double val = data.tokPerSec.Value;
                string num = val >= 100
                    ? Math.Round(val).ToString("0", CultureInfo.InvariantCulture)
                    : val.ToString("0.0", CultureInfo.InvariantCulture);
                _speedRow.ValueText.Text = num + " tok/s";
            }
            else
            {
                _speedRow.ValueText.Text = "--";
            }

            _cacheRow.ValueText.Text = (data != null && data.cacheHitPct.HasValue)
                ? string.Format("{0}%", Math.Max(0, Math.Min(100, data.cacheHitPct.Value)))
                : "--";

            _modelRow.ValueText.Text = (data != null && !string.IsNullOrEmpty(data.upstreamModelId))
                ? data.upstreamModelId
                : "--";

            if (data != null && data.totalUsed > 0)
            {
                _contextRow.ValueText.Text = string.Format("{0} / {1}", FormatTokenK(data.totalUsed), FormatTokenK(data.windowCap));
            }
            else
            {
                _contextRow.ValueText.Text = string.Format("{0}%", pct);
            }

            ApplyCheckStyles();
        }

        public void PositionAboveHud(Native.RECT hostWinRect, int anchorCenterX, int anchorCenterY, double dpiScale)
        {
            double safeScale = Math.Max(0.75, Math.Min(3.5, dpiScale));
            double wpfDpiX = 1.0;
            double wpfDpiY = 1.0;
            try
            {
                PresentationSource src = PresentationSource.FromVisual(this);
                if (src != null && src.CompositionTarget != null)
                {
                    Matrix m = src.CompositionTarget.TransformToDevice;
                    if (m.M11 > 0.1) wpfDpiX = m.M11;
                    if (m.M22 > 0.1) wpfDpiY = m.M22;
                }
            }
            catch { }

            double relX = safeScale / wpfDpiX;
            double relY = safeScale / wpfDpiY;
            _rootScale.ScaleX = relX;
            _rootScale.ScaleY = relY;

            int physW = (int)Math.Ceiling(TotalDipWidth * safeScale);
            int physH = (int)Math.Ceiling(TotalDipHeight * safeScale);
            int padPx = (int)Math.Round(ShadowPadDip * safeScale);
            int hudHalfH = (int)Math.Round(13.0 * safeScale);
            // Anchor snugly right above the Context Ring / HUD toolbar strip
            int gapPx = (int)Math.Round(8.0 * safeScale);

            int x = anchorCenterX - physW / 2;
            int y = (anchorCenterY - hudHalfH - gapPx) - (physH - padPx);

            int clampLeft = hostWinRect.Left + (int)Math.Round(8.0 * safeScale) - padPx;
            int clampRight = hostWinRect.Right - (int)Math.Round(8.0 * safeScale) - (physW - padPx);
            int clampTop = hostWinRect.Top + (int)Math.Round(36.0 * safeScale) - padPx;
            int clampBottom = hostWinRect.Bottom - (int)Math.Round(8.0 * safeScale) - (physH - padPx);

            try
            {
                System.Drawing.Rectangle wa = Screen.FromPoint(new System.Drawing.Point(anchorCenterX, anchorCenterY)).WorkingArea;
                if (wa.Width > 0 && wa.Height > 0)
                {
                    clampLeft = Math.Max(clampLeft, wa.Left - padPx + 4);
                    clampRight = Math.Min(clampRight, wa.Right - (physW - padPx) - 4);
                    clampTop = Math.Max(clampTop, wa.Top - padPx + 4);
                    clampBottom = Math.Min(clampBottom, wa.Bottom - (physH - padPx) - 4);
                }
            }
            catch { }

            if (clampRight >= clampLeft)
            {
                if (x < clampLeft) x = clampLeft;
                if (x > clampRight) x = clampRight;
            }
            if (y < clampTop)
            {
                y = anchorCenterY + hudHalfH + (int)Math.Round(8.0 * safeScale) - padPx;
            }
            if (clampBottom >= clampTop)
            {
                if (y > clampBottom) y = clampBottom;
                if (y < clampTop) y = clampTop;
            }

            _lastHostWinRect = hostWinRect;
            _lastCardLeftPx = x + padPx;
            _lastCardRightPx = x + physW - padPx;
            _lastCardBottomPx = y + physH - padPx;
            _lastDpiScale = safeScale;

            Left = x / wpfDpiX;
            Top = y / wpfDpiY;
            Width = physW / wpfDpiX;
            Height = physH / wpfDpiY;

            if (_hwnd != IntPtr.Zero && Native.IsWindow(_hwnd))
            {
                Native.SetWindowPos(_hwnd, IntPtr.Zero, x, y, physW, physH, Native.SWP_NOACTIVATE | Native.SWP_NOZORDER | Native.SWP_SHOWWINDOW);
            }
            if (_guidePreview != null)
            {
                _guidePreview.PositionBesidePopup(_lastHostWinRect, _lastCardLeftPx, _lastCardRightPx, _lastCardBottomPx, _lastDpiScale);
            }
        }

        private void SafeClose()
        {
            if (_closingStarted) return;
            _closingStarted = true;
            HideGuidePreview();
            try { Close(); } catch { }
        }
    }

    internal static class UiaHelper
    {
        private static readonly string[] ModeKeywords = new string[]
        {
            "turbo", "planning", "fast",
            "极速", "规划", "快速"
        };

        private static readonly string[] MicKeywords = new string[]
        {
            "microphone", "voice", "dictate", "speech", "audio", "麦克风", "语音"
        };

        private static readonly string[] SendStopKeywords = new string[]
        {
            "send", "stop", "发送", "停止"
        };

        private static bool ContainsAny(string haystack, string[] needles)
        {
            if (string.IsNullOrEmpty(haystack)) return false;
            string low = haystack.ToLowerInvariant();
            for (int i = 0; i < needles.Length; i++)
            {
                if (low.Contains(needles[i])) return true;
            }
            return false;
        }

        private static readonly string[] HeaderChromeIgnore = new string[]
        {
            "antigravity", "workspace", "view", "window", "file", "edit", "help",
            "new conversation", "automations", "customizations", "settings", "projects",
            "project options", "filter projects", "new project", "add project", "sort",
            "search", "back", "forward", "toggle sidebar", "collapse", "expand",
            "swarm", "agy 控制台", "antigravity monitor", "review", "ask anything"
        };

        private static bool IsHeaderChromeText(string text)
        {
            if (string.IsNullOrEmpty(text)) return true;
            string t = text.Trim();
            if (t.Length <= 1 || t.Length > 110) return true;
            if (t.StartsWith("[AGY_PROGRESS", StringComparison.OrdinalIgnoreCase) || t.Contains("[AGY_PROGRESS|")) return true;
            if (t.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || t.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return true;
            string low = t.ToLowerInvariant();
            for (int i = 0; i < HeaderChromeIgnore.Length; i++)
            {
                if (low == HeaderChromeIgnore[i] || low.StartsWith("swarm worker")) return true;
            }
            if (low.EndsWith(".mjs") || low.EndsWith(".js") || low.EndsWith(".ts") || low.EndsWith(".cs") || low.EndsWith(".json")) return true;
            if (low.Contains("window.") || low.Contains("sidecar.") || low.Contains("document.") || low.Contains("()")) return true;
            return false;
        }

        private static bool IsNewConversationTitle(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;
            string low = text.Trim().ToLowerInvariant();
            return low == "new conversation" || low == "新建对话";
        }

        private static bool TryGetValidRect(AutomationElement el, out System.Windows.Rect rect)
        {
            rect = System.Windows.Rect.Empty;
            if (el == null) return false;
            try
            {
                rect = el.Current.BoundingRectangle;
                if (rect.IsEmpty || double.IsNaN(rect.Left) || double.IsInfinity(rect.Left)) return false;
                if (rect.Width <= 1 || rect.Height <= 1) return false;
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static void FindToolbarRowAndComposerBox(
            AutomationElement chosen,
            System.Windows.Rect chosenRect,
            int winW,
            double dpiScale,
            out AutomationElement toolbarRow,
            out AutomationElement composerBox
        )
        {
            toolbarRow = null;
            composerBox = null;
            if (chosen == null) return;
            try
            {
                AutomationElement cur = TreeWalker.ControlViewWalker.GetParent(chosen);
                for (int hop = 0; hop < 8 && cur != null; hop++)
                {
                    System.Windows.Rect ar;
                    if (TryGetValidRect(cur, out ar) &&
                        ar.Width >= 140.0 * dpiScale && ar.Width <= winW * 0.92 &&
                        ar.Left <= chosenRect.Left - 24.0 * dpiScale &&
                        ar.Right >= chosenRect.Right - 4.0 * dpiScale)
                    {
                        if (toolbarRow == null && ar.Height >= 20.0 * dpiScale && ar.Height <= 72.0 * dpiScale)
                        {
                            toolbarRow = cur;
                        }
                        if (composerBox == null && ar.Height >= 52.0 * dpiScale && ar.Height <= 420.0 * dpiScale)
                        {
                            composerBox = cur;
                            if (toolbarRow != null) break;
                        }
                    }
                    try { cur = TreeWalker.ControlViewWalker.GetParent(cur); }
                    catch { break; }
                }
            }
            catch { }
        }

        private static void CollectLeftToolbarBoundary(
            AutomationElement container,
            AutomationElement chosen,
            System.Windows.Rect chosenRect,
            double cy,
            int rowAlignTol,
            int winW,
            double dpiScale,
            int depth,
            ref int visited,
            ref int bestLeftRight,
            ref AutomationElement bestLeft
        )
        {
            if (container == null || visited >= 48) return;
            try
            {
                AutomationElement child = TreeWalker.ControlViewWalker.GetFirstChild(container);
                while (child != null && visited < 48)
                {
                    visited++;
                    if (!SameElement(child, chosen))
                    {
                        System.Windows.Rect br;
                        if (TryGetValidRect(child, out br))
                        {
                            if (br.Left < chosenRect.Left - 2.0 * dpiScale)
                            {
                                ControlType ct = null;
                                try { ct = child.Current.ControlType; } catch { }
                                bool isControl =
                                    ct == ControlType.Button ||
                                    ct == ControlType.ComboBox ||
                                    ct == ControlType.SplitButton ||
                                    ct == ControlType.MenuItem ||
                                    ct == ControlType.Hyperlink;
                                if (isControl)
                                {
                                    double bcy = (br.Top + br.Bottom) / 2.0;
                                    double bMidX = (br.Left + br.Right) / 2.0;
                                    if (Math.Abs(bcy - cy) <= rowAlignTol &&
                                        bMidX < chosenRect.Left &&
                                        br.Width < winW * 0.55 &&
                                        br.Right <= chosenRect.Right + 2.0 * dpiScale)
                                    {
                                        int candRight = (int)Math.Round(br.Right) + (int)Math.Round(5 * dpiScale);
                                        if (candRight > bestLeftRight)
                                        {
                                            bestLeftRight = candRight;
                                            bestLeft = child;
                                        }
                                    }
                                }
                                else if (ct == ControlType.Text || ct == ControlType.Image)
                                {
                                    double bcy = (br.Top + br.Bottom) / 2.0;
                                    double bMidX = (br.Left + br.Right) / 2.0;
                                    if (Math.Abs(bcy - cy) <= rowAlignTol &&
                                        bMidX < chosenRect.Left &&
                                        br.Width < winW * 0.50 &&
                                        br.Right <= chosenRect.Left + 4.0 * dpiScale)
                                    {
                                        int candRight = (int)Math.Round(br.Right) + (int)Math.Round(8 * dpiScale);
                                        if (candRight > bestLeftRight)
                                        {
                                            bestLeftRight = candRight;
                                            bestLeft = child;
                                        }
                                    }
                                }
                                else if (depth > 0)
                                {
                                    CollectLeftToolbarBoundary(
                                        child, chosen, chosenRect, cy, rowAlignTol, winW, dpiScale,
                                        depth - 1, ref visited, ref bestLeftRight, ref bestLeft
                                    );
                                }
                            }
                        }
                        else if (depth > 0)
                        {
                            CollectLeftToolbarBoundary(
                                child, chosen, chosenRect, cy, rowAlignTol, winW, dpiScale,
                                depth - 1, ref visited, ref bestLeftRight, ref bestLeft
                            );
                        }
                    }
                    try { child = TreeWalker.ControlViewWalker.GetNextSibling(child); }
                    catch { break; }
                }
            }
            catch { }
        }

        public static volatile string LastOcclusionDebug = "";

        private static string SafeCtName(AutomationElement el)
        {
            if (el == null) return "null";
            try
            {
                ControlType ct = el.Current.ControlType;
                return ct != null ? (ct.ProgrammaticName ?? "ct") : "null";
            }
            catch { return "err"; }
        }

        private static string SafeRectStr(System.Windows.Rect r)
        {
            if (r.IsEmpty) return "empty";
            return ((int)Math.Round(r.Left)).ToString() + "," + ((int)Math.Round(r.Top)).ToString() + "," +
                   ((int)Math.Round(r.Width)).ToString() + "x" + ((int)Math.Round(r.Height)).ToString();
        }

        private static AutomationElement FindNearestDocument(AutomationElement el)
        {
            if (el == null) return null;
            try
            {
                AutomationElement cur = el;
                for (int hop = 0; hop < 36 && cur != null; hop++)
                {
                    ControlType ct = null;
                    try { ct = cur.Current.ControlType; } catch { }
                    if (ct == ControlType.Document) return cur;
                    if (ct == ControlType.Window) return null;
                    try { cur = TreeWalker.ControlViewWalker.GetParent(cur); }
                    catch { return null; }
                }
            }
            catch { }
            return null;
        }

        private static bool IsCandidateUncovered(AutomationElement btn, System.Windows.Rect r, int selfPid)
        {
            if (btn == null || r.Width < 4 || r.Height < 4) return false;
            try
            {
                double cx = r.Left + r.Width * 0.5;
                double cy = r.Top + r.Height * 0.5;
                AutomationElement hit = AutomationElement.FromPoint(new System.Windows.Point(cx, cy));
                if (hit == null) return true;
                int hitPid = 0;
                try { hitPid = hit.Current.ProcessId; } catch { }
                if (hitPid == selfPid) return true;
                if (SameElement(hit, btn)) return true;

                AutomationElement btnDoc = FindNearestDocument(btn);
                AutomationElement hitDoc = FindNearestDocument(hit);
                if (hitDoc != null && btnDoc != null && !SameElement(hitDoc, btnDoc))
                {
                    return false;
                }
            }
            catch { }
            return true;
        }

        private static bool IsAgyConsoleDocument(AutomationElement doc)
        {
            if (doc == null) return false;
            try
            {
                string docName = doc.Current.Name ?? "";
                if (!string.IsNullOrEmpty(docName) &&
                    (docName.IndexOf("Antigravity Monitor", StringComparison.OrdinalIgnoreCase) >= 0 ||
                     docName.IndexOf("AGY 控制台", StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    return true;
                }
            }
            catch { }
            return false;
        }

        private static bool IsInsideAgyConsoleDocument(AutomationElement el)
        {
            return IsAgyConsoleDocument(FindNearestDocument(el));
        }

        public static HudAnchorInfo ProbeComposerAnchor(
            IntPtr hwnd,
            Native.RECT winRect,
            int selfPid,
            ref AutomationElement cachedAnchor,
            ref int cachedKind,
            ref AutomationElement cachedLeftGuard,
            ref AutomationElement cachedComposerBox
        )
        {
            var result = new HudAnchorInfo
            {
                HasAnchor = false,
                ComposerVisible = true,
                FromUia = false,
                RightX = winRect.Left + (int)Math.Round((winRect.Right - winRect.Left) * 0.56),
                LeftGuardX = winRect.Left + 240,
                CenterY = winRect.Bottom - 36,
                AnchorWinLeft = winRect.Left,
                AnchorWinTop = winRect.Top,
                AnchorWinRight = winRect.Right,
                AnchorWinBottom = winRect.Bottom
            };

            double dpiScale = Native.GetWindowDpiScale(hwnd);
            int winW = Math.Max(1, winRect.Right - winRect.Left);
            int winH = Math.Max(1, winRect.Bottom - winRect.Top);
            // Composer bottom toolbar stays pinned within the bottom ~108 DIP (multiline textarea expands upward).
            int bandTop = winRect.Bottom - (int)Math.Round(108 * dpiScale);
            int bandBottom = winRect.Bottom - (int)Math.Round(4 * dpiScale);
            int minBtnLeft = winRect.Left + (int)Math.Round(120 * dpiScale);
            int maxBtnRight = winRect.Right - 4;
            int defaultLeftGuard = winRect.Left + (int)Math.Round(220 * dpiScale);
            int rowAlignTol = (int)Math.Round(16 * dpiScale);

            // Fast path: reuse cached UIA anchor + left-guard + composer-box elements (<0.5ms)
            if (cachedAnchor != null)
            {
                System.Windows.Rect cr;
                if (TryGetValidRect(cachedAnchor, out cr) &&
                    cr.Top >= bandTop && cr.Bottom <= bandBottom &&
                    cr.Left >= minBtnLeft && cr.Right <= maxBtnRight)
                {
                    int baseShift = cachedKind == 1 ? 5 : (cachedKind == 2 ? 36 : 86);
                    int extraShift = (int)Math.Round(baseShift * dpiScale);
                    int rX = (int)Math.Round(cr.Left) - extraShift;
                    int lGuard = defaultLeftGuard;

                    // Hard clamp: never allow HUD to escape outside the composer box's own left edge
                    if (cachedComposerBox != null)
                    {
                        System.Windows.Rect boxR;
                        if (TryGetValidRect(cachedComposerBox, out boxR) &&
                            boxR.Left < cr.Left && boxR.Right >= cr.Right - 6.0 * dpiScale)
                        {
                            int boxLeftGuard = (int)Math.Round(boxR.Left) + (int)Math.Round(10 * dpiScale);
                            if (boxLeftGuard > lGuard) lGuard = boxLeftGuard;
                        }
                    }

                    bool leftGuardHealthy = false;
                    if (cachedLeftGuard != null)
                    {
                        System.Windows.Rect lr;
                        if (TryGetValidRect(cachedLeftGuard, out lr) &&
                            Math.Abs(((lr.Top + lr.Bottom) / 2.0) - ((cr.Top + cr.Bottom) / 2.0)) <= rowAlignTol &&
                            lr.Left < cr.Left - 2.0 * dpiScale &&
                            (lr.Left + lr.Right) / 2.0 < cr.Left)
                        {
                            // Keep exact right edge of model picker / left button even when squeezed right against anchor!
                            int lgRight = (int)Math.Round(lr.Right) + (int)Math.Round(5 * dpiScale);
                            if (lgRight > lGuard) lGuard = lgRight;
                            leftGuardHealthy = true;
                        }
                    }

                    // Only stay on fast path when left guard is still valid; if model picker re-mounted, re-scan immediately!
                    if (leftGuardHealthy)
                    {
                        result.HasAnchor = true;
                        result.ComposerVisible = true;
                        result.FromUia = true;
                        result.RightX = rX;
                        result.LeftGuardX = lGuard;
                        result.CenterY = (int)Math.Round((cr.Top + cr.Bottom) / 2.0);
                        return result;
                    }
                }
                cachedAnchor = null;
                cachedKind = 0;
                cachedLeftGuard = null;
                cachedComposerBox = null;
            }

            try
            {
                AutomationElement root = AutomationElement.FromHandle(hwnd);
                if (root == null) return result;

                // Include ComboBox / SplitButton / MenuItem so Radix/Electron model picker (<button role="combobox">) is never missed!
                System.Windows.Automation.Condition ctrlCond = new OrCondition(
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ComboBox),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.SplitButton),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuItem)
                );
                AutomationElementCollection buttons = root.FindAll(TreeScope.Descendants, ctrlCond);

                if (buttons == null || buttons.Count == 0)
                {
                    return result;
                }

                AutomationElement modeMatch = null;
                System.Windows.Rect modeRect = System.Windows.Rect.Empty;
                bool modeUncovered = false;
                AutomationElement micMatch = null;
                System.Windows.Rect micRect = System.Windows.Rect.Empty;
                bool micUncovered = false;
                AutomationElement sendMatch = null;
                System.Windows.Rect sendRect = System.Windows.Rect.Empty;
                bool sendUncovered = false;
                var rowButtons = new List<KeyValuePair<AutomationElement, System.Windows.Rect>>();
                int bottomButtonCount = 0;
                bool isHostFg = Native.GetForegroundWindow() == hwnd;

                double minBtnH = 14.0 * dpiScale;
                double maxBtnH = 54.0 * dpiScale;
                double minModeW = 16.0 * dpiScale;
                double maxModeW = 170.0 * dpiScale;
                double maxIconW = 56.0 * dpiScale;

                for (int i = 0; i < buttons.Count; i++)
                {
                    AutomationElement btn = buttons[i];
                    System.Windows.Rect r;
                    if (!TryGetValidRect(btn, out r)) continue;
                    if (r.Top < bandTop || r.Bottom > bandBottom) continue;
                    if (r.Height < minBtnH || r.Height > maxBtnH) continue;
                    if (r.Left < minBtnLeft || r.Right > maxBtnRight) continue;

                    bottomButtonCount++;
                    rowButtons.Add(new KeyValuePair<AutomationElement, System.Windows.Rect>(btn, r));
                    string name = "";
                    try { name = btn.Current.Name ?? ""; } catch { name = ""; }
                    if (string.IsNullOrEmpty(name)) continue;

                    if (ContainsAny(name, ModeKeywords) && r.Width >= minModeW && r.Width <= maxModeW)
                    {
                        if (!IsInsideAgyConsoleDocument(btn))
                        {
                            bool candUncovered = !isHostFg || IsCandidateUncovered(btn, r, selfPid);
                            bool better = modeMatch == null
                                || (candUncovered && !modeUncovered)
                                || (candUncovered == modeUncovered && r.Bottom > modeRect.Bottom);
                            if (better)
                            {
                                modeMatch = btn;
                                modeRect = r;
                                modeUncovered = candUncovered;
                            }
                        }
                    }
                    else if (ContainsAny(name, MicKeywords) && r.Width <= maxIconW)
                    {
                        if (!IsInsideAgyConsoleDocument(btn))
                        {
                            bool candUncovered = !isHostFg || IsCandidateUncovered(btn, r, selfPid);
                            bool better = micMatch == null
                                || (candUncovered && !micUncovered)
                                || (candUncovered == micUncovered && r.Bottom > micRect.Bottom);
                            if (better)
                            {
                                micMatch = btn;
                                micRect = r;
                                micUncovered = candUncovered;
                            }
                        }
                    }
                    else if (ContainsAny(name, SendStopKeywords) && r.Width <= maxIconW)
                    {
                        if (!IsInsideAgyConsoleDocument(btn))
                        {
                            bool candUncovered = !isHostFg || IsCandidateUncovered(btn, r, selfPid);
                            bool better = sendMatch == null
                                || (candUncovered && !sendUncovered)
                                || (candUncovered == sendUncovered && r.Bottom > sendRect.Bottom);
                            if (better)
                            {
                                sendMatch = btn;
                                sendRect = r;
                                sendUncovered = candUncovered;
                            }
                        }
                    }
                }

                // Prefer any uncovered foreground composer candidate over a covered background conversation's candidate
                if (modeMatch != null && !modeUncovered && ((micMatch != null && micUncovered) || (sendMatch != null && sendUncovered)))
                {
                    modeMatch = null;
                }
                if (micMatch != null && !micUncovered && sendMatch != null && sendUncovered)
                {
                    micMatch = null;
                }

                // When narrow pane collapses Turbo into an unlabeled shield icon directly left of Mic, anchor before it
                if (modeMatch == null && micMatch != null)
                {
                    AutomationElement micDoc = FindNearestDocument(micMatch);
                    double mcy = (micRect.Top + micRect.Bottom) / 2.0;
                    for (int i = 0; i < rowButtons.Count; i++)
                    {
                        AutomationElement cand = rowButtons[i].Key;
                        if (SameElement(cand, micMatch)) continue;
                        System.Windows.Rect br = rowButtons[i].Value;
                        double bcy = (br.Top + br.Bottom) / 2.0;
                        if (Math.Abs(bcy - mcy) <= 14.0 * dpiScale && br.Right <= micRect.Left + 2.0 * dpiScale && (micRect.Left - br.Right) <= 28.0 * dpiScale && br.Width <= 52.0 * dpiScale)
                        {
                            if (micDoc != null)
                            {
                                AutomationElement candDoc = FindNearestDocument(cand);
                                if (candDoc != null && !SameElement(candDoc, micDoc)) continue;
                            }
                            modeMatch = cand;
                            modeRect = br;
                            break;
                        }
                    }
                }

                AutomationElement chosen = null;
                System.Windows.Rect chosenRect = System.Windows.Rect.Empty;
                int chosenKind = 0;
                int shift = (int)Math.Round(5 * dpiScale);
                if (modeMatch != null) { chosen = modeMatch; chosenRect = modeRect; chosenKind = 1; shift = (int)Math.Round(5 * dpiScale); }
                else if (micMatch != null) { chosen = micMatch; chosenRect = micRect; chosenKind = 2; shift = (int)Math.Round(36 * dpiScale); }
                else if (sendMatch != null) { chosen = sendMatch; chosenRect = sendRect; chosenKind = 3; shift = (int)Math.Round(86 * dpiScale); }

                if (chosen != null)
                {
                    int rX = (int)Math.Round(chosenRect.Left) - shift;
                    double cy = (chosenRect.Top + chosenRect.Bottom) / 2.0;

                    AutomationElement toolbarRow, composerBox;
                    FindToolbarRowAndComposerBox(chosen, chosenRect, winW, dpiScale, out toolbarRow, out composerBox);

                    int bestLeftRight = defaultLeftGuard;
                    if (composerBox != null)
                    {
                        System.Windows.Rect boxR;
                        if (TryGetValidRect(composerBox, out boxR))
                        {
                            int boxLeft = (int)Math.Round(boxR.Left) + (int)Math.Round(10 * dpiScale);
                            if (boxLeft > bestLeftRight) bestLeftRight = boxLeft;
                        }
                    }

                    // Verify this is a real multi-button composer toolbar row (prevents false attachment on Settings/Terminal/Diff buttons)
                    AutomationElement chosenDoc = FindNearestDocument(chosen);
                    int sameRowCount = 0;
                    AutomationElement bestLeft = null;
                    for (int i = 0; i < rowButtons.Count; i++)
                    {
                        System.Windows.Rect br = rowButtons[i].Value;
                        double bcy = (br.Top + br.Bottom) / 2.0;
                        if (Math.Abs(bcy - cy) > rowAlignTol) continue;
                        if (!SameElement(rowButtons[i].Key, chosen) && chosenDoc != null)
                        {
                            AutomationElement candDoc = FindNearestDocument(rowButtons[i].Key);
                            if (candDoc != null && !SameElement(candDoc, chosenDoc)) continue;
                        }
                        sameRowCount++;
                        if (SameElement(rowButtons[i].Key, chosen)) continue;
                        double bMidX = (br.Left + br.Right) / 2.0;
                        // Include EVERY control strictly left of chosen (even when touching/squeezed right up to chosen!)
                        if (br.Left >= chosenRect.Left - 2.0 * dpiScale || bMidX >= chosenRect.Left) continue;
                        if (br.Width > winW * 0.55 || br.Right > chosenRect.Right + 2.0 * dpiScale) continue;
                        int brRight = (int)Math.Round(br.Right) + (int)Math.Round(5 * dpiScale);
                        if (brRight > bestLeftRight)
                        {
                            bestLeftRight = brRight;
                            bestLeft = rowButtons[i].Key;
                        }
                    }

                    // Also inspect toolbarRow subtree directly (<0.3ms) so ARIA-less custom/text model pickers are never missed
                    if (toolbarRow != null)
                    {
                        int visited = 0;
                        CollectLeftToolbarBoundary(
                            toolbarRow, chosen, chosenRect, cy, rowAlignTol, winW, dpiScale,
                            4, ref visited, ref bestLeftRight, ref bestLeft
                        );
                    }

                    if (sameRowCount >= 2)
                    {
                        cachedAnchor = chosen;
                        cachedKind = chosenKind;
                        cachedLeftGuard = bestLeft;
                        cachedComposerBox = composerBox;
                        result.HasAnchor = true;
                        result.ComposerVisible = true;
                        result.FromUia = true;
                        result.RightX = rX;
                        result.LeftGuardX = bestLeftRight;
                        result.CenterY = (int)Math.Round(cy);
                        return result;
                    }
                }

                // UIA tree is live (>6 buttons in window) but no composer anchor matched: hide instead of drifting
                if (buttons.Count > 6)
                {
                    result.ComposerVisible = false;
                    result.FromUia = true;
                }
            }
            catch { }

            return result;
        }

        private static bool RectsOverlap(double l1, double t1, double r1, double b1, double l2, double t2, double r2, double b2)
        {
            return l1 < r2 && r1 > l2 && t1 < b2 && b1 > t2;
        }

        private static readonly string[] PopupTextMarkers = new string[]
        {
            "weekly limit", "5h limit", "resets in", "% left", "view usage", "claude and gpt", "gemini models", "usage limits", "quota",
            "使用限额", "查看用量", "重置于", "每周限额", "5小时限额", "后重置", "剩余", "查看额度", "切换模型",
            "gemini 模型", "claude 与 gpt", "模型配额", "用量", "限额",
            "subagents", "subagent", "running", "mention", "workflows", "skills", "rules", "mcp"
        };

        private static readonly string[] IgnoreWin32OverlayClasses = new string[]
        {
            "IME", "MSCTFIME UI", "CicMarshalWndClass", "Shell_TrayWnd", "Shell_SecondaryTrayWnd",
            "NotifyIconOverflowWindow", "NarratorHelperWindow", "EdgeUiInputTopWndClass", "DummyDWMListenerWindow"
        };

        private static bool IsIgnoredWin32OverlayClass(IntPtr hwnd)
        {
            try
            {
                var sb = new StringBuilder(96);
                if (Native.GetClassName(hwnd, sb, sb.Capacity) <= 0) return false;
                string cls = sb.ToString();
                for (int i = 0; i < IgnoreWin32OverlayClasses.Length; i++)
                {
                    if (string.Equals(cls, IgnoreWin32OverlayClasses[i], StringComparison.OrdinalIgnoreCase)) return true;
                }
            }
            catch { }
            return false;
        }

        private static bool IsElementExpanded(AutomationElement el)
        {
            if (el == null) return false;
            try
            {
                object patObj;
                if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out patObj))
                {
                    var pat = (ExpandCollapsePattern)patObj;
                    return pat.Current.ExpandCollapseState == ExpandCollapseState.Expanded;
                }
            }
            catch { }
            return false;
        }

        private static bool SameElement(AutomationElement a, AutomationElement b)
        {
            if (a == null || b == null) return false;
            try { return Automation.Compare(a, b); }
            catch { return false; }
        }

        private static bool CheckPortalContainerChildren(
            AutomationElement container,
            AutomationElement skipChild,
            int winW,
            int winH,
            int hudLeft,
            int hudTop,
            int hudRight,
            int hudBottom,
            int maxSiblings,
            int descendDepth
        )
        {
            if (container == null) return false;
            try
            {
                AutomationElement child = TreeWalker.ControlViewWalker.GetLastChild(container);
                int count = 0;
                while (child != null && count < maxSiblings)
                {
                    count++;
                    if (!SameElement(child, skipChild))
                    {
                        System.Windows.Rect r;
                        if (TryGetValidRect(child, out r))
                        {
                            bool isFullWin = r.Width >= winW * 0.88 && r.Height >= winH * 0.85;
                            bool isColumn = r.Height >= winH * 0.82;
                            if (!isFullWin && !isColumn && r.Width >= 50 && r.Height >= 30 &&
                                RectsOverlap(r.Left, r.Top, r.Right, r.Bottom, hudLeft - 4, hudTop - 4, hudRight + 4, hudBottom + 4))
                            {
                                return true;
                            }
                            if (descendDepth > 0 && (isFullWin || r.Width >= 50))
                            {
                                if (CheckPortalContainerChildren(child, null, winW, winH, hudLeft, hudTop, hudRight, hudBottom, 6, descendDepth - 1))
                                {
                                    return true;
                                }
                            }
                        }
                        else if (descendDepth > 0)
                        {
                            // Zero-sized portal wrapper (e.g. <div id="portal-root"> or Radix wrapper)
                            if (CheckPortalContainerChildren(child, null, winW, winH, hudLeft, hudTop, hudRight, hudBottom, 6, descendDepth - 1))
                            {
                                return true;
                            }
                        }
                    }
                    child = TreeWalker.ControlViewWalker.GetPreviousSibling(child);
                }
            }
            catch { }
            return false;
        }

        public static bool IsHudOccluded(
            IntPtr hostHwnd,
            IntPtr hudHwnd,
            IntPtr backdropHwnd,
            int selfPid,
            Native.RECT winRect,
            HudAnchorInfo anchor,
            AutomationElement cachedAnchor,
            AutomationElement cachedLeftGuard,
            bool runUiaChecks,
            bool prevOccluded,
            string prevReason,
            out string reason
        )
        {
            reason = "";
            if (!anchor.HasAnchor || !anchor.ComposerVisible) return false;

            double dpiScale = Native.GetWindowDpiScale(hostHwnd);
            int winW = Math.Max(1, winRect.Right - winRect.Left);
            int winH = Math.Max(1, winRect.Bottom - winRect.Top);
            int hudRight = anchor.RightX;
            int hudLeft = Math.Max(anchor.LeftGuardX, hudRight - (int)Math.Round(360 * dpiScale));
            int hudHalfH = (int)Math.Round(13 * dpiScale);
            int hudTop = anchor.CenterY - hudHalfH;
            int hudBottom = anchor.CenterY + hudHalfH;

            // 1. Fast Z-order walk (pure Win32, ~0.05ms): hide if a real higher Win32 window/popup covers the HUD
            try
            {
                IntPtr prev = Native.GetWindow(hostHwnd, Native.GW_HWNDPREV);
                int steps = 0;
                while (prev != IntPtr.Zero && steps < 256)
                {
                    steps++;
                    if (prev != hudHwnd && prev != backdropHwnd && Native.IsWindowVisible(prev) && !Native.IsIconic(prev) && !Native.IsWindowCloaked(prev))
                    {
                        long ex = Native.GetWindowLongPtrCompat(prev, Native.GWL_EXSTYLE);
                        if ((ex & (Native.WS_EX_TRANSPARENT | Native.WS_EX_TOOLWINDOW)) == 0 && !IsIgnoredWin32OverlayClass(prev))
                        {
                            // Skip invisible layered overlay shells (alpha == 0) that shouldn't hide the HUD
                            bool isZeroAlphaLayered = false;
                            if ((ex & Native.WS_EX_LAYERED) != 0)
                            {
                                uint ck, lflags;
                                byte lalpha;
                                if (Native.GetLayeredWindowAttributes(prev, out ck, out lalpha, out lflags) &&
                                    (lflags & Native.LWA_ALPHA) != 0 && lalpha == 0)
                                {
                                    isZeroAlphaLayered = true;
                                }
                            }
                            if (!isZeroAlphaLayered)
                            {
                                uint pid;
                                Native.GetWindowThreadProcessId(prev, out pid);
                                if ((int)pid != selfPid)
                                {
                                    Native.RECT pr;
                                    if (Native.TryGetVisibleBounds(prev, out pr) &&
                                        (pr.Right - pr.Left) >= 60 && (pr.Bottom - pr.Top) >= 32 &&
                                        RectsOverlap(pr.Left, pr.Top, pr.Right, pr.Bottom, hudLeft, hudTop, hudRight, hudBottom))
                                    {
                                        reason = "win32-above";
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                    prev = Native.GetWindow(prev, Native.GW_HWNDPREV);
                }
            }
            catch { }

            if (!runUiaChecks)
            {
                // Preserve prior UIA popup occlusion state between 260ms probes so HUD never flashes on top of open menus
                if (prevOccluded && !string.Equals(prevReason, "win32-above", StringComparison.Ordinal))
                {
                    reason = prevReason ?? "";
                    return true;
                }
                return false;
            }

            // 2. O(1) ExpandCollapse check on Model picker & Mode picker triggers (~0.05ms):
            // catches "Model" dropdown, "View Usage" submenu, and "Turbo" menu instantly!
            if (IsElementExpanded(cachedLeftGuard) || IsElementExpanded(cachedAnchor))
            {
                reason = "trigger-expanded";
                return true;
            }

            // Build cachedAnchor's ancestor chain once (up to Document and Window) for both Step 2b (anchor-covered) & Step 3 (portal check)
            var chain = new List<AutomationElement>();
            var composerAncestors = new List<AutomationElement>();
            AutomationElement anchorDoc = null;
            int docIdx = -1;
            if (cachedAnchor != null)
            {
                try
                {
                    AutomationElement cur = cachedAnchor;
                    for (int hop = 0; hop < 32 && cur != null; hop++)
                    {
                        chain.Add(cur);
                        if (docIdx < 0 && hop < 8) composerAncestors.Add(cur);
                        ControlType cct = null;
                        try { cct = cur.Current.ControlType; } catch { }
                        if (docIdx < 0 && cct == ControlType.Document)
                        {
                            docIdx = hop;
                            anchorDoc = cur;
                        }
                        if (cct == ControlType.Window) break;
                        try { cur = TreeWalker.ControlViewWalker.GetParent(cur); }
                        catch { break; }
                    }
                }
                catch { }
            }

            // 2b. O(1) Anchor visibility hit-test (~0.3ms):
            // Detects maximized Side Panel / iframe (e.g. full-screen AGY Console with left sidebar open) covering the composer,
            // while never false-triggering on inner spans/wrappers, re-mounted buttons inside cachedAnchor's rect, or outer Document/Pane fallbacks!
            if (cachedAnchor != null)
            {
                try
                {
                    System.Windows.Rect ar;
                    if (TryGetValidRect(cachedAnchor, out ar) && ar.Width >= 8 && ar.Height >= 8)
                    {
                        double acx = ar.Left + ar.Width * 0.5;
                        double acy = ar.Top + ar.Height * 0.5;
                        AutomationElement aHit = AutomationElement.FromPoint(new System.Windows.Point(acx, acy));
                        if (aHit != null && !SameElement(aHit, cachedAnchor))
                        {
                            int aHitPid = 0;
                            ControlType aHitCt = null;
                            try
                            {
                                aHitPid = aHit.Current.ProcessId;
                                aHitCt = aHit.Current.ControlType;
                            }
                            catch { }
                            if (aHitPid != selfPid && aHitCt != ControlType.Window)
                            {
                                bool hitIsAncestorOfAnchor = false;
                                for (int ci = 0; ci < chain.Count; ci++)
                                {
                                    if (SameElement(aHit, chain[ci]))
                                    {
                                        hitIsAncestorOfAnchor = true;
                                        break;
                                    }
                                }

                                if (!hitIsAncestorOfAnchor)
                                {
                                    bool hitMatchesAnchor = false;
                                    bool hitSharesComposer = false;
                                    AutomationElement hitNearestDoc = null;
                                    AutomationElement walk = aHit;
                                    for (int hop = 0; hop < 36 && walk != null; hop++)
                                    {
                                        if (SameElement(walk, cachedAnchor))
                                        {
                                            hitMatchesAnchor = true;
                                            break;
                                        }
                                        for (int ci = 0; ci < composerAncestors.Count; ci++)
                                        {
                                            if (SameElement(walk, composerAncestors[ci]))
                                            {
                                                hitSharesComposer = true;
                                                break;
                                            }
                                        }
                                        if (hitSharesComposer) break;
                                        ControlType wct = null;
                                        try { wct = walk.Current.ControlType; } catch { }
                                        if (hitNearestDoc == null && wct == ControlType.Document)
                                        {
                                            hitNearestDoc = walk;
                                        }
                                        if (wct == ControlType.Window) break;
                                        try { walk = TreeWalker.ControlViewWalker.GetParent(walk); }
                                        catch { break; }
                                    }

                                    if (!hitMatchesAnchor && !hitSharesComposer)
                                    {
                                        // Case A: Hit belongs to a DIFFERENT Document (e.g. maximized AGY Console sidecar iframe or another conversation tab)
                                        if (hitNearestDoc != null && anchorDoc != null && !SameElement(hitNearestDoc, anchorDoc))
                                        {
                                            bool hitIsConsoleDoc = IsAgyConsoleDocument(hitNearestDoc);
                                            System.Windows.Rect hrA;
                                            bool hitInsideAnchorRect =
                                                TryGetValidRect(aHit, out hrA) &&
                                                hrA.Left >= ar.Left - 6 && hrA.Right <= ar.Right + 6 &&
                                                hrA.Top >= ar.Top - 6 && hrA.Bottom <= ar.Bottom + 6;
                                            // Never false-occlude if FromPoint inside the exact anchor rect hits an equivalent composer button (non-Console)
                                            bool hitIsVisibleComposerTwin = false;
                                            if (!hitIsConsoleDoc && hitInsideAnchorRect)
                                            {
                                                try
                                                {
                                                    string hitName = aHit.Current.Name ?? "";
                                                    if (!string.IsNullOrEmpty(hitName) &&
                                                        (ContainsAny(hitName, ModeKeywords) || ContainsAny(hitName, MicKeywords) || ContainsAny(hitName, SendStopKeywords)))
                                                    {
                                                        hitIsVisibleComposerTwin = true;
                                                    }
                                                }
                                                catch { }
                                            }
                                            if (!hitIsVisibleComposerTwin)
                                            {
                                                uint hostPid = 0;
                                                Native.GetWindowThreadProcessId(hostHwnd, out hostPid);
                                                LastOcclusionDebug =
                                                    "aRect=" + SafeRectStr(ar) +
                                                    " hitCt=" + SafeCtName(aHit) +
                                                    " hRect=" + SafeRectStr(hrA) +
                                                    " samePid=" + (aHitPid == (int)hostPid ? "1" : "0") +
                                                    " consoleDoc=" + (hitIsConsoleDoc ? "1" : "0");
                                                reason = hitIsConsoleDoc ? "anchor-covered-console" : "anchor-covered-doc";
                                                return true;
                                            }
                                        }

                                        // Case B: Unrelated same-document covering panel (skip outer Document/Pane fallback
                                        // and skip inner wrappers / freshly re-mounted Turbo buttons strictly inside cachedAnchor's rect)
                                        if (aHitCt != ControlType.Document && aHitCt != ControlType.Pane)
                                        {
                                            System.Windows.Rect hr;
                                            bool strictlyInsideAnchor =
                                                TryGetValidRect(aHit, out hr) &&
                                                hr.Left >= ar.Left - 6 && hr.Right <= ar.Right + 6 &&
                                                hr.Top >= ar.Top - 6 && hr.Bottom <= ar.Bottom + 6;
                                            if (!strictlyInsideAnchor)
                                            {
                                                reason = "anchor-covered";
                                                return true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            // 3. O(1) React/Radix Portal sibling check (~0.5ms, zero FindAll, zero self-flicker):
            // inspects trailing non-ancestor portal siblings on body/#root using the ancestor chain already built above.
            if (docIdx >= 1)
            {
                try
                {
                    int checkTop = hudTop - (int)Math.Round(10 * dpiScale);
                    // Inspect portals mounted directly on <body> (including nested Radix sub-popups like View Usage / 使用限额)
                    if (CheckPortalContainerChildren(chain[docIdx], chain[docIdx - 1], winW, winH, hudLeft, checkTop, hudRight, hudBottom, 16, 4))
                    {
                        reason = "doc-portal";
                        return true;
                    }
                    // Inspect portals mounted inside #root (first wrapper inside Document)
                    if (docIdx >= 2 && CheckPortalContainerChildren(chain[docIdx - 1], chain[docIdx - 2], winW, winH, hudLeft, checkTop, hudRight, hudBottom, 12, 3))
                    {
                        reason = "root-portal";
                        return true;
                    }
                    // Inspect portals mounted inside top-level app shell
                    if (docIdx >= 3 && CheckPortalContainerChildren(chain[docIdx - 2], chain[docIdx - 3], winW, winH, hudLeft, checkTop, hudRight, hudBottom, 8, 2))
                    {
                        reason = "shell-portal";
                        return true;
                    }
                }
                catch { }
            }

            // 4. Multi-point FromPoint + ancestor-walk detector above HUD:
            // catches nested Chinese/English popups (e.g. 查看用量 -> 使用限额) even when mounted deep inside portals
            try
            {
                double midX = (hudLeft + hudRight) / 2.0;
                double[] probeXs = new double[]
                {
                    Math.Min(hudRight - 14.0, hudLeft + 18.0),
                    midX,
                    Math.Max(hudLeft + 14.0, hudRight - 18.0)
                };
                double probeY = hudTop - Math.Max(8.0, 8.0 * dpiScale);
                if (probeY > winRect.Top + 60)
                {
                    for (int pi = 0; pi < probeXs.Length; pi++)
                    {
                        double px = probeXs[pi];
                        if (px <= winRect.Left + 120 || px >= winRect.Right - 8) continue;
                        AutomationElement hit = null;
                        try { hit = AutomationElement.FromPoint(new System.Windows.Point(px, probeY)); } catch { continue; }
                        if (hit == null) continue;
                        int hitPid = 0;
                        ControlType hitCt = null;
                        try
                        {
                            hitPid = hit.Current.ProcessId;
                            hitCt = hit.Current.ControlType;
                        }
                        catch { continue; }
                        if (hitPid == selfPid) continue;

                        bool hitIsComposerInput = (hitCt == ControlType.Edit || hitCt == ControlType.Document);
                        AutomationElement anc = hit;
                        bool sharedComposerAncestor = false;
                        bool sawFloatingPopupBox = false;
                        for (int hop = 0; hop < 8 && anc != null; hop++)
                        {
                            ControlType ct = null;
                            string an = "";
                            System.Windows.Rect ar = System.Windows.Rect.Empty;
                            try
                            {
                                ct = anc.Current.ControlType;
                                an = anc.Current.Name ?? "";
                                TryGetValidRect(anc, out ar);
                            }
                            catch { break; }

                            if (ct == ControlType.MenuItem || ct == ControlType.Menu || ct == ControlType.List || ct == ControlType.ListItem || ct == ControlType.ToolTip)
                            {
                                reason = "frompoint-menu-ancestor";
                                return true;
                            }
                            if (ContainsAny(an, PopupTextMarkers))
                            {
                                reason = "frompoint-marker-ancestor";
                                return true;
                            }
                            for (int ci = 0; ci < composerAncestors.Count; ci++)
                            {
                                if (SameElement(anc, composerAncestors[ci]))
                                {
                                    sharedComposerAncestor = true;
                                    break;
                                }
                            }
                            if (sharedComposerAncestor) break;

                            if (!hitIsComposerInput && !ar.IsEmpty &&
                                ar.Width >= 90.0 * dpiScale && ar.Width < winW * 0.68 &&
                                ar.Height >= 60.0 * dpiScale && ar.Height < winH * 0.78 &&
                                RectsOverlap(ar.Left, ar.Top, ar.Right, ar.Bottom, hudLeft - 6, hudTop - 12, hudRight + 6, hudBottom + 6))
                            {
                                sawFloatingPopupBox = true;
                            }

                            if (ct == ControlType.Document || ct == ControlType.Window) break;
                            try { anc = TreeWalker.ControlViewWalker.GetParent(anc); }
                            catch { break; }
                        }

                        if (sawFloatingPopupBox && !sharedComposerAncestor && composerAncestors.Count > 0)
                        {
                            reason = "frompoint-portal-box";
                            return true;
                        }
                    }
                }
            }
            catch { }

            return false;
        }

        public static ActiveViewInfo ProbeActiveConversationTitlePureWin32(IntPtr hwnd)
        {
            var info = new ActiveViewInfo { Workspace = "", Title = "" };
            try
            {
                string raw = Native.GetWindowTitleText(hwnd);
                if (string.IsNullOrEmpty(raw)) return info;
                string low = raw.ToLowerInvariant();
                if (low == "antigravity" || low == "antigravity_original") return info;
                // Strip trailing " - Antigravity" if present
                int dashIdx = raw.LastIndexOf(" - Antigravity", StringComparison.OrdinalIgnoreCase);
                if (dashIdx > 0) raw = raw.Substring(0, dashIdx).Trim();
                if (string.IsNullOrEmpty(raw)) return info;
                if (IsNewConversationTitle(raw))
                {
                    info.IsNewConversation = true;
                    info.Title = raw;
                    return info;
                }
                int slashIdx = raw.IndexOf(" / ", StringComparison.Ordinal);
                if (slashIdx > 0 && slashIdx < raw.Length - 3)
                {
                    string ws = raw.Substring(0, slashIdx).Trim();
                    string title = raw.Substring(slashIdx + 3).Trim();
                    if (IsNewConversationTitle(title))
                    {
                        info.Workspace = ws;
                        info.Title = title;
                        info.IsNewConversation = true;
                        return info;
                    }
                    if (!IsHeaderChromeText(title))
                    {
                        info.Workspace = ws;
                        info.Title = title;
                        return info;
                    }
                }
                if (!IsHeaderChromeText(raw))
                {
                    info.Title = raw;
                }
            }
            catch { }
            return info;
        }

        public static HudAnchorInfo ComputePureWin32ComposerAnchor(IntPtr hwnd, Native.RECT winRect, bool consoleVisible, int consolePhysW)
        {
            // Strict Zero-UIA mode deliberately disables guessed Mode-1 WPF HUD coordinates so it never drifts
            // across dynamic splits/sidebars/Review panes (Mode-2 CDP DOM HUD remains pixel-perfect with zero UIA).
            return new HudAnchorInfo
            {
                HasAnchor = false,
                ComposerVisible = false,
                Occluded = false,
                FromUia = false,
                RightX = 0,
                LeftGuardX = 0,
                CenterY = 0,
                AnchorWinLeft = winRect.Left,
                AnchorWinTop = winRect.Top,
                AnchorWinRight = winRect.Right,
                AnchorWinBottom = winRect.Bottom
            };
        }

        public static ActiveViewInfo ProbeActiveConversationView(IntPtr hwnd, Native.RECT winRect)
        {
            ActiveViewInfo fastTitle = ProbeActiveConversationTitlePureWin32(hwnd);
            if (fastTitle.IsNewConversation || !string.IsNullOrEmpty(fastTitle.Title))
            {
                return fastTitle;
            }
            var info = new ActiveViewInfo { Workspace = "", Title = "" };
            try
            {
                AutomationElement root = AutomationElement.FromHandle(hwnd);
                if (root == null) return info;

                System.Windows.Automation.Condition cond = new OrCondition(
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Hyperlink)
                );
                AutomationElementCollection elems = root.FindAll(TreeScope.Descendants, cond);
                if (elems == null || elems.Count == 0) return info;

                // Chat header breadcrumb sits strictly in the top header bar (y ~ Top+26 .. Top+66 logical px), never inside scrolled chat messages
                double dpiScale = Native.GetWindowDpiScale(hwnd);
                int headTop = winRect.Top + (int)Math.Round(26 * dpiScale);
                int headBottom = winRect.Top + (int)Math.Round(66 * dpiScale);
                int headMinX = winRect.Left + (int)Math.Round(210 * dpiScale);
                int headMaxX = winRect.Right - (int)Math.Round(90 * dpiScale);
                double maxHeaderItemH = 38.0 * dpiScale;
                double minTextItemW = 24.0 * dpiScale;

                var headerItems = new List<KeyValuePair<double, string>>();
                for (int i = 0; i < elems.Count; i++)
                {
                    AutomationElement el = elems[i];
                    System.Windows.Rect r;
                    if (!TryGetValidRect(el, out r)) continue;
                    if (r.Top < headTop || r.Bottom > headBottom) continue;
                    if (r.Left < headMinX || r.Right > headMaxX) continue;
                    if (r.Height > maxHeaderItemH) continue;

                    string name = "";
                    try { name = (el.Current.Name ?? "").Trim(); } catch { continue; }
                    if (string.IsNullOrEmpty(name)) continue;
                    // Skip tiny icon-only buttons, but keep "/" separator and short workspace names like "agy"
                    if (name != "/" && r.Width < minTextItemW) continue;
                    if (name.Length > 140) continue;

                    // Single-node breadcrumb format: "CastoriceQQbot / 读取指定会话内容"
                    if (IsNewConversationTitle(name))
                    {
                        info.Workspace = "";
                        info.Title = name;
                        info.IsNewConversation = true;
                        return info;
                    }
                    int slashIdx = name.IndexOf(" / ", StringComparison.Ordinal);
                    if (slashIdx > 0 && slashIdx < name.Length - 3)
                    {
                        string ws = name.Substring(0, slashIdx).Trim();
                        string title = name.Substring(slashIdx + 3).Trim();
                        if (IsNewConversationTitle(title))
                        {
                            info.Workspace = ws;
                            info.Title = title;
                            info.IsNewConversation = true;
                            return info;
                        }
                        if (!IsHeaderChromeText(title))
                        {
                            info.Workspace = ws;
                            info.Title = title;
                            return info;
                        }
                    }

                    headerItems.Add(new KeyValuePair<double, string>(r.Left, name));
                }

                if (headerItems.Count > 0)
                {
                    headerItems.Sort(delegate(KeyValuePair<double, string> a, KeyValuePair<double, string> b)
                    {
                        return a.Key.CompareTo(b.Key);
                    });

                    // Look for adjacent tokens separated by "/" on the header row
                    for (int i = 0; i < headerItems.Count; i++)
                    {
                        if (headerItems[i].Value == "/" && i + 1 < headerItems.Count)
                        {
                            string ws = i > 0 ? headerItems[i - 1].Value : "";
                            string title = headerItems[i + 1].Value;
                            if (IsNewConversationTitle(title))
                            {
                                info.Workspace = ws;
                                info.Title = title;
                                info.IsNewConversation = true;
                                return info;
                            }
                            if (!IsHeaderChromeText(title))
                            {
                                info.Workspace = ws;
                                info.Title = title;
                                return info;
                            }
                        }
                    }

                    // Fallback: first non-chrome title near the left of the chat canvas header
                    int maxHeaderTitleX = winRect.Left + (int)Math.Round(560 * dpiScale);
                    for (int i = 0; i < headerItems.Count; i++)
                    {
                        if (headerItems[i].Key > maxHeaderTitleX) break;
                        string candidate = headerItems[i].Value;
                        if (IsNewConversationTitle(candidate))
                        {
                            info.Title = candidate;
                            info.IsNewConversation = true;
                            return info;
                        }
                        if (candidate == "/" || IsHeaderChromeText(candidate)) continue;
                        // Reject scrolled chat body fragments (starting with punctuation or ending with colon)
                        char firstCh = candidate[0];
                        char lastCh = candidate[candidate.Length - 1];
                        if (firstCh == '，' || firstCh == '。' || firstCh == '、' || firstCh == '：' || firstCh == ',' || firstCh == ':' || firstCh == '•' || firstCh == '-' || lastCh == '：' || lastCh == ':')
                        {
                            continue;
                        }
                        if (candidate.Length < 3 || candidate.Length > 88) continue;
                        info.Title = candidate;
                        return info;
                    }
                }
            }
            catch { }

            return info;
        }
    }

    internal sealed class TrackedHostWindow
    {
        public IntPtr Hwnd;
        public long OriginalExStyle;
        public bool OriginallyLayered;
        public bool AlphaApplied;
        public byte LastAlpha = 255;
        public BackdropSurfaceWindow Backdrop;
        public bool BackdropVisible;
        public int BackdropZFailCount;
        public bool BackdropGuardBlocked;
        public string BackdropBlockReason = "";
        public int LastLeft;
        public int LastTop;
        public int LastWidth;
        public int LastHeight;
        public bool LastMaximized;
        public int AppliedConfigVersion;

        public HudOverlayWindow Hud;
        public bool HudVisible;
        public int LastHudX;
        public int LastHudY;
        public int LastHudW;
        public int LastHudH;
        public double LastHostDpiScale = 1.0;
        public HudAnchorInfo Anchor;
        public int AnchorMissCount;
        public DateTime LastOcclusionCheckUtc = DateTime.MinValue;
        public string LastOccludedReason = "";
        public bool ConsoleOccluded = false;
        public AutomationElement CachedUiaAnchor;
        public int CachedUiaAnchorKind;
        public AutomationElement CachedLeftGuard;
        public AutomationElement CachedComposerBox;
        public DateTime LastFullUiaScanUtc = DateTime.MinValue;
        public string WindowWorkspace = "";
        public string WindowTitle = "";
        public bool WindowIsNewConv = false;
        public DateTime WindowViewUpdatedUtc = DateTime.MinValue;
    }

    internal struct PendingWinMove
    {
        public IntPtr Hwnd;
        public IntPtr InsertAfter;
        public int X;
        public int Y;
        public int W;
        public int H;
        public uint Flags;
    }

    internal sealed class CompanionController : IDisposable
    {
        private const string StopEventName = @"Local\AgyMonitorBackdropStop";
        private const string TrimEventName = @"Local\AgyMonitorBackdropTrim";
        private readonly string _dataDir;
        private readonly string _assetsDir;
        private readonly string _themesPath;
        private readonly string _hudTelemetryPath;
        private readonly string _hudActiveViewPath;
        private readonly string _hudDisplayPath;
        private readonly string _consoleViewportPath;
        private readonly string _statusPath;
        private readonly string _lightboxCmdPath;
        private readonly Dispatcher _dispatcher;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();
        private readonly Dictionary<IntPtr, TrackedHostWindow> _tracked = new Dictionary<IntPtr, TrackedHostWindow>();
        private readonly List<IntPtr> _hooks = new List<IntPtr>();
        private readonly Dictionary<uint, List<IntPtr>> _hostPidHooks = new Dictionary<uint, List<IntPtr>>();
        private IntPtr _dragLocationHook = IntPtr.Zero;
        private Native.WinEventDelegate _winEventDelegate;

        private FileSystemWatcher _watcher;
        private DispatcherTimer _debounceTimer;
        private DispatcherTimer _reconcileTimer;
        private DispatcherTimer _fastStateTimer;
        private Thread _stopListenerThread;
        private Thread _trimListenerThread;
        private Thread _uiaWorkerThread;
        private EventWaitHandle _stopEvent;
        private EventWaitHandle _trimEvent;
        private readonly AutoResetEvent _uiaWakeEvent = new AutoResetEvent(false);
        private NotifyIcon _trayIcon;
        private Icon _trayIconGlyph;
        private ContextMenuStrip _trayMenu;
        private IntPtr _trayIconHandle = IntPtr.Zero;
        private readonly int _selfPid;
        private readonly int _parentPid;
        private DateTime _orphanSinceUtc = DateTime.MinValue;
        private ToolStripMenuItem _statusMenuItem;
        private ToolStripMenuItem _pauseMenuItem;
        private ToolStripMenuItem _hudMenuItem;

        private ThemeConfig _config = new ThemeConfig();
        private HudTelemetry _hudTelemetry = new HudTelemetry();
        private HudDisplayConfig _hudDisplay = new HudDisplayConfig();
        private string _cachedWpPath = "";
        private DateTime _cachedWpMtimeUtc = DateTime.MinValue;
        private BitmapSource _cachedBitmap = null;
        private BitmapSource _cachedBlurredBitmap = null;
        private int _cachedBlurredRadius = 0;
        private string _cachedBlurredWpPath = "";
        private DateTime _cachedBlurredWpMtimeUtc = DateTime.MinValue;
        private DateTime _lastThemesWriteUtc = DateTime.MinValue;
        private long _lastThemesLength = -1;
        private DateTime _lastHudWriteUtc = DateTime.MinValue;
        private long _lastHudLength = -1;
        private string _lastHudActiveConvId = "";
        private DateTime _lastHudActiveConvChangedUtc = DateTime.MinValue;
        private DateTime _lastHudDisplayWriteUtc = DateTime.MinValue;
        private long _lastHudDisplayLength = -1;
        private DateTime _lastConsoleViewportWriteUtc = DateTime.MinValue;
        private long _lastConsoleViewportLength = -1;
        private bool _consoleViewportVisible = false;
        private int _consoleViewportPhysW = 0;
        private int _consoleViewportOuterW = 0;
        private long _consoleViewportUpdatedMs = 0;
        private DateTime _lastLightboxCmdWriteUtc = DateTime.MinValue;
        private long _lastLightboxCmdLength = -1;
        private string _lastLightboxCmdId = "";
        private ImageLightboxWindow _lightbox = null;
        private IntPtr _lightboxOwnerHwnd = IntPtr.Zero;
        private HudConfigPopupWindow _hudPopup = null;
        private IntPtr _hudPopupOwnerHwnd = IntPtr.Zero;
        private bool _hudPopupOpening = false;
        private bool _systemEventsHooked = false;
        private IntPtr _popupInitialFgHwnd = IntPtr.Zero;
        private DateTime _lastHudPopupClosedUtc = DateTime.MinValue;
        private DispatcherTimer _popupWatchTimer;
        private bool _popupPrevMouseDown = false;
        private int _configVersion = 0;
        private DateTime _lastStatusWriteUtc = DateTime.MinValue;
        private DateTime _fastTrackUntilUtc = DateTime.MinValue;
        private DateTime _lastViewProbeUtc = DateTime.MinValue;
        private DateTime _pendingViewProbeAtUtc = DateTime.MaxValue;
        private volatile bool _forceViewProbe = true;
        private string _lastViewKey = "";
        private string _lastViewWorkspace = "";
        private string _lastViewTitle = "";
        private bool _pausedByTray = false;
        private bool _hudEnabledByTray = true;
        private volatile bool _disposed = false;
        private int _backdropHideCount = 0;
        private string _backdropLastHideReason = "";
        private int _backdropZFixCount = 0;
        private string _backdropZBlockerClass = "";
        private DateTime _lastReorderSyncUtc = DateTime.MinValue;
        private bool _inSync = false;
        private bool _syncPending = false;
        private string _hudLastAction = "";
        private IntPtr _moveSizingHwnd = IntPtr.Zero;
        private bool _renderFollowAttached = false;
        private DateTime _renderFollowStartedUtc = DateTime.MinValue;
        private DateTime _renderFollowLastChangeUtc = DateTime.MinValue;
        private Native.RECT _renderFollowLastRect;

        public CompanionController(string dataDir, string assetsDir, Dispatcher dispatcher, int parentPid = 0)
        {
            _dataDir = dataDir;
            _assetsDir = assetsDir;
            _themesPath = System.IO.Path.Combine(_dataDir, "themes.json");
            _hudTelemetryPath = System.IO.Path.Combine(_dataDir, "hud_telemetry.json");
            _hudActiveViewPath = System.IO.Path.Combine(_dataDir, "hud_active_view.json");
            _hudDisplayPath = System.IO.Path.Combine(_dataDir, "hud_display.json");
            _consoleViewportPath = System.IO.Path.Combine(_dataDir, "console_viewport.json");
            _statusPath = System.IO.Path.Combine(_dataDir, "backdrop_status.json");
            _lightboxCmdPath = System.IO.Path.Combine(_dataDir, "lightbox_cmd.json");
            _dispatcher = dispatcher;
            _parentPid = parentPid > 0 ? parentPid : 0;
            using (Process cur = Process.GetCurrentProcess())
            {
                _selfPid = cur.Id;
            }
        }

        private static bool IsPidAlive(int pid)
        {
            if (pid <= 0) return false;
            try
            {
                using (Process p = Process.GetProcessById(pid))
                {
                    return !p.HasExited;
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool HasAnyAntigravityHostProcess()
        {
            Process[] procs = null;
            try
            {
                procs = Process.GetProcesses();
                for (int i = 0; i < procs.Length; i++)
                {
                    Process p = procs[i];
                    if (p == null) continue;
                    try
                    {
                        if (IsAntigravityHostProcessName(p.ProcessName)) return true;
                    }
                    catch { }
                }
            }
            catch { }
            finally
            {
                if (procs != null)
                {
                    for (int i = 0; i < procs.Length; i++)
                    {
                        try { if (procs[i] != null) procs[i].Dispose(); } catch { }
                    }
                }
            }
            return false;
        }

        private bool CheckHostLiveness()
        {
            if (_parentPid <= 0) return true;
            if (IsPidAlive(_parentPid) || HasAnyAntigravityHostProcess())
            {
                _orphanSinceUtc = DateTime.MinValue;
                return true;
            }
            DateTime now = DateTime.UtcNow;
            if (_orphanSinceUtc == DateTime.MinValue)
            {
                _orphanSinceUtc = now;
                return true;
            }
            if ((now - _orphanSinceUtc).TotalSeconds >= 20.0)
            {
                ShutdownGracefully();
                return false;
            }
            return true;
        }

        public void Start()
        {
            Directory.CreateDirectory(_dataDir);
            try
            {
                if (File.Exists(_lightboxCmdPath))
                {
                    var fi = new FileInfo(_lightboxCmdPath);
                    _lastLightboxCmdWriteUtc = fi.LastWriteTimeUtc;
                    _lastLightboxCmdLength = fi.Length;
                }
            }
            catch { }
            InitTray();
            ReloadThemeConfig(true);
            ReloadHudDisplayConfig();
            ReloadHudTelemetry();
            ReloadConsoleViewport();
            InstallHooks();
            InstallSystemEvents();
            InstallWatcher();
            StartStopEventListener();
            StartUiaAnchorWorker();

            _debounceTimer = new DispatcherTimer(DispatcherPriority.Render, _dispatcher);
            _debounceTimer.Interval = TimeSpan.FromMilliseconds(16);
            _debounceTimer.Tick += delegate
            {
                _debounceTimer.Stop();
                SyncAllWindows(false);
            };

            int reconcileTick = 0;
            bool startupTrimmed = false;
            _reconcileTimer = new DispatcherTimer(DispatcherPriority.Background, _dispatcher);
            _reconcileTimer.Interval = TimeSpan.FromMilliseconds(2500);
            _reconcileTimer.Tick += delegate
            {
                if (_disposed) return;
                reconcileTick++;
                if (!CheckHostLiveness()) return;
                CheckDataFilesTimestamp();
                SyncAllWindows((reconcileTick % 2) == 0);
                if (!startupTrimmed && reconcileTick >= 2)
                {
                    startupTrimmed = true;
                    Native.TrimWorkingSet();
                }
                else if ((reconcileTick % 120) == 0)
                {
                    Native.TrimWorkingSet();
                }
                if ((DateTime.UtcNow - _lastStatusWriteUtc).TotalSeconds >= 15.0)
                {
                    WriteStatusFile(true);
                }
            };
            _reconcileTimer.Start();

            _fastStateTimer = new DispatcherTimer(DispatcherPriority.Background, _dispatcher);
            _fastStateTimer.Interval = TimeSpan.FromMilliseconds(150);
            _fastStateTimer.Tick += delegate
            {
                FastStateWatchTick();
            };
            _fastStateTimer.Start();

            SyncAllWindows(true);
            WriteStatusFile(true);
        }

        private void InitTray()
        {
            using (var bmp = new Bitmap(16, 16))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.Clear(System.Drawing.Color.FromArgb(20, 22, 29));
                    using (var brushA = new SolidBrush(System.Drawing.Color.FromArgb(91, 140, 255)))
                    using (var brushB = new SolidBrush(System.Drawing.Color.FromArgb(61, 194, 167)))
                    {
                        g.FillEllipse(brushA, 2, 2, 12, 12);
                        g.FillEllipse(brushB, 5, 5, 6, 6);
                    }
                }
                _trayIconHandle = bmp.GetHicon();
            }
            _trayIconGlyph = Icon.FromHandle(_trayIconHandle);

            _trayMenu = new ContextMenuStrip();
            var menu = _trayMenu;
            _statusMenuItem = new ToolStripMenuItem("AGY 桌面伴侣");
            _statusMenuItem.Enabled = false;
            menu.Items.Add(_statusMenuItem);
            menu.Items.Add(new ToolStripSeparator());

            _pauseMenuItem = new ToolStripMenuItem("暂停贴背壁纸");
            _pauseMenuItem.Click += delegate
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    _pausedByTray = !_pausedByTray;
                    _pauseMenuItem.Text = _pausedByTray ? "恢复贴背壁纸" : "暂停贴背壁纸";
                    SyncAllWindows(true);
                    WriteStatusFile(true);
                }));
            };
            menu.Items.Add(_pauseMenuItem);

            _hudMenuItem = new ToolStripMenuItem("显示输入框状态胶囊 (HUD)");
            _hudMenuItem.Checked = _hudEnabledByTray;
            _hudMenuItem.Click += delegate
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    bool nextHud = !(_config.hudEnabled && _hudEnabledByTray);
                    _config.hudEnabled = nextHud;
                    _hudEnabledByTray = nextHud;
                    _hudMenuItem.Checked = nextHud;
                    PersistHudEnabledToThemesFile(nextHud);
                    SyncAllWindows(false);
                    WriteStatusFile(true);
                }));
            };
            menu.Items.Add(_hudMenuItem);

            var reloadItem = new ToolStripMenuItem("立即刷新配置");
            reloadItem.Click += delegate
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    ReloadThemeConfig(true);
                    ReloadHudTelemetry();
                    SyncAllWindows(true);
                    WriteStatusFile(true);
                }));
            };
            menu.Items.Add(reloadItem);

            var trimItem = new ToolStripMenuItem("立即释放内存");
            trimItem.Click += delegate
            {
                ThreadPool.QueueUserWorkItem(delegate
                {
                    try { Native.TrimWorkingSet(); } catch { }
                });
            };
            menu.Items.Add(trimItem);

            menu.Items.Add(new ToolStripSeparator());
            var exitItem = new ToolStripMenuItem("退出并还原主窗不透明");
            exitItem.Click += delegate
            {
                _dispatcher.BeginInvoke(new Action(ShutdownGracefully));
            };
            menu.Items.Add(exitItem);

            _trayIcon = new NotifyIcon
            {
                Icon = _trayIconGlyph,
                Text = "AGY 桌面伴侣（壁纸 + 输入框 HUD）",
                ContextMenuStrip = _trayMenu,
                Visible = true
            };
        }

        private void StartStopEventListener()
        {
            _stopEvent = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName);
            try { _stopEvent.Reset(); } catch { }
            _stopListenerThread = new Thread(delegate()
            {
                try
                {
                    _stopEvent.WaitOne();
                    if (!_disposed)
                    {
                        _dispatcher.BeginInvoke(new Action(ShutdownGracefully));
                    }
                }
                catch { }
            });
            _stopListenerThread.IsBackground = true;
            _stopListenerThread.Start();

            try
            {
                _trimEvent = new EventWaitHandle(false, EventResetMode.AutoReset, TrimEventName);
                _trimListenerThread = new Thread(delegate()
                {
                    while (!_disposed)
                    {
                        try
                        {
                            if (!_trimEvent.WaitOne(5000)) continue;
                            if (_disposed) break;
                            Native.TrimWorkingSet();
                        }
                        catch { break; }
                    }
                });
                _trimListenerThread.IsBackground = true;
                _trimListenerThread.Start();
            }
            catch { }
        }

        private void DetachDragLocationHook()
        {
            if (_dragLocationHook != IntPtr.Zero)
            {
                try { Native.UnhookWinEvent(_dragLocationHook); } catch { }
                _dragLocationHook = IntPtr.Zero;
            }
        }

        private void AttachDragLocationHook(IntPtr hwnd)
        {
            DetachDragLocationHook();
            if (_disposed || _winEventDelegate == null || hwnd == IntPtr.Zero || !Native.IsWindow(hwnd)) return;
            uint pid = 0;
            Native.GetWindowThreadProcessId(hwnd, out pid);
            if (pid == 0 || pid == (uint)_selfPid) return;
            uint flags = Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS;
            _dragLocationHook = Native.SetWinEventHook(
                Native.EVENT_OBJECT_LOCATIONCHANGE,
                Native.EVENT_OBJECT_LOCATIONCHANGE,
                IntPtr.Zero,
                _winEventDelegate,
                pid,
                0,
                flags
            );
        }

        private void StartRenderFollow(IntPtr hwnd)
        {
            _moveSizingHwnd = hwnd;
            _renderFollowStartedUtc = DateTime.UtcNow;
            _renderFollowLastChangeUtc = DateTime.UtcNow;
            if (hwnd != IntPtr.Zero)
            {
                Native.TryGetVisibleBounds(hwnd, out _renderFollowLastRect);
            }
            AttachDragLocationHook(hwnd);
            if (!_renderFollowAttached && !_disposed)
            {
                _renderFollowAttached = true;
                CompositionTarget.Rendering += OnCompositionRendering;
            }
        }

        private void StopRenderFollow()
        {
            DetachDragLocationHook();
            if (_renderFollowAttached)
            {
                _renderFollowAttached = false;
                try { CompositionTarget.Rendering -= OnCompositionRendering; } catch { }
            }
            _moveSizingHwnd = IntPtr.Zero;
            foreach (TrackedHostWindow item in _tracked.Values)
            {
                if (item.Backdrop != null)
                {
                    item.Backdrop.SetInteractiveResizeMode(false);
                }
            }
        }

        private void OnCompositionRendering(object sender, EventArgs e)
        {
            if (_disposed || !_renderFollowAttached)
            {
                StopRenderFollow();
                return;
            }

            DateTime now = DateTime.UtcNow;
            bool leftDown = (Native.GetAsyncKeyState(Native.VK_LBUTTON) & 0x8000) != 0;
            bool rectMoved = false;
            bool sizeChanged = false;
            if (_moveSizingHwnd != IntPtr.Zero && Native.IsWindow(_moveSizingHwnd))
            {
                Native.RECT cur;
                if (Native.TryGetVisibleBounds(_moveSizingHwnd, out cur))
                {
                    int prevW = _renderFollowLastRect.Right - _renderFollowLastRect.Left;
                    int prevH = _renderFollowLastRect.Bottom - _renderFollowLastRect.Top;
                    int curW = cur.Right - cur.Left;
                    int curH = cur.Bottom - cur.Top;
                    if (cur.Left != _renderFollowLastRect.Left || cur.Top != _renderFollowLastRect.Top || curW != prevW || curH != prevH)
                    {
                        rectMoved = true;
                        sizeChanged = (curW != prevW || curH != prevH);
                        _renderFollowLastRect = cur;
                        _renderFollowLastChangeUtc = now;
                    }
                }
            }

            if (sizeChanged && _moveSizingHwnd != IntPtr.Zero)
            {
                TrackedHostWindow resizingItem;
                if (_tracked.TryGetValue(_moveSizingHwnd, out resizingItem) && resizingItem.Backdrop != null)
                {
                    resizingItem.Backdrop.SetInteractiveResizeMode(true);
                }
            }

            if (rectMoved && !_inSync)
            {
                SyncAllWindows(false);
            }

            // Safety auto-detach after drag/snap animation finishes
            if (!leftDown && (now - _renderFollowLastChangeUtc).TotalMilliseconds > 350 && (now - _renderFollowStartedUtc).TotalMilliseconds > 400)
            {
                StopRenderFollow();
                if (!_inSync) SyncAllWindows(false);
            }
        }

        private void SetFastStateIntervalMs(int ms)
        {
            if (_fastStateTimer == null) return;
            if (Math.Abs(_fastStateTimer.Interval.TotalMilliseconds - ms) > 1.0)
            {
                _fastStateTimer.Interval = TimeSpan.FromMilliseconds(ms);
            }
        }

        private void FastStateWatchTick()
        {
            if (_disposed || _inSync || _tracked.Count == 0)
            {
                SetFastStateIntervalMs(800);
                return;
            }
            if (_renderFollowAttached)
            {
                SetFastStateIntervalMs(400);
                return;
            }

            IntPtr fg = Native.GetForegroundWindow();
            bool fgTracked = fg != IntPtr.Zero && _tracked.ContainsKey(fg);
            SetFastStateIntervalMs(fgTracked ? 150 : 800);

            bool wantBackdrop = IsBackdropEffectWanted();
            foreach (TrackedHostWindow item in _tracked.Values)
            {
                if (!Native.IsWindow(item.Hwnd))
                {
                    SyncAllWindows(true);
                    return;
                }

                bool hostVis = Native.IsWindowVisible(item.Hwnd) && !Native.IsIconic(item.Hwnd) && !Native.IsWindowCloaked(item.Hwnd);
                if (!hostVis)
                {
                    if (item.Backdrop != null && item.BackdropVisible && item.Backdrop.Handle != IntPtr.Zero)
                    {
                        Native.ShowWindow(item.Backdrop.Handle, Native.SW_HIDE);
                        item.BackdropVisible = false;
                        _backdropHideCount++;
                        _backdropLastHideReason = "fast-watch-hidden";
                    }
                    HideHudIfVisible(item);
                    continue;
                }

                if (wantBackdrop && !item.BackdropVisible && !item.BackdropGuardBlocked)
                {
                    SyncAllWindows(false);
                    return;
                }

                if (!wantBackdrop || !item.BackdropVisible || item.Backdrop == null || item.Backdrop.Handle == IntPtr.Zero)
                {
                    continue;
                }

                Native.RECT r;
                if (Native.TryGetVisibleBounds(item.Hwnd, out r))
                {
                    int w = Math.Max(1, r.Right - r.Left);
                    int h = Math.Max(1, r.Bottom - r.Top);
                    bool isMax = Native.IsZoomed(item.Hwnd);
                    if (r.Left != item.LastLeft || r.Top != item.LastTop || w != item.LastWidth || h != item.LastHeight || isMax != item.LastMaximized)
                    {
                        SyncAllWindows(false);
                        StartRenderFollow(item.Hwnd);
                        return;
                    }

                    IntPtr nextHwnd = Native.GetWindow(item.Hwnd, Native.GW_HWNDNEXT);
                    if (nextHwnd != item.Backdrop.Handle)
                    {
                        string blk;
                        if (!Native.IsDirectlyBehindVisible(item.Backdrop.Handle, item.Hwnd, r, out blk))
                        {
                            SyncAllWindows(false);
                            return;
                        }
                    }
                }
            }
        }

        private void TriggerFastUiaBurst(int durationMs, bool probeView)
        {
            DateTime target = DateTime.UtcNow.AddMilliseconds(durationMs);
            if (target > _fastTrackUntilUtc)
            {
                _fastTrackUntilUtc = target;
            }
            if (probeView)
            {
                _forceViewProbe = true;
            }
            try { _uiaWakeEvent.Set(); } catch { }
        }

        private void WriteActiveViewFile(string workspace, string title, bool isNewConversation, bool forceRefreshTimestamp)
        {
            try
            {
                string ws = (workspace ?? "").Trim();
                string t = (title ?? "").Trim();
                if (!isNewConversation && string.IsNullOrEmpty(t)) return;
                string key = isNewConversation ? "__new_conversation__" : (ws + "|" + t);
                if (!forceRefreshTimestamp && string.Equals(key, _lastViewKey, StringComparison.Ordinal)) return;

                // Use a local serializer because WriteActiveViewFile runs on the background UIA worker thread
                var localJson = new JavaScriptSerializer();

                // Protect recent sidecar_focus UUID writes (from clicking a session row in AGY Console)
                // from being clobbered by a stale or title-only UIA header read.
                try
                {
                    if (File.Exists(_hudActiveViewPath))
                    {
                        string existingRaw = ReadTextWithRetry(_hudActiveViewPath);
                        var existingDoc = !string.IsNullOrEmpty(existingRaw)
                            ? (localJson.DeserializeObject(existingRaw) as Dictionary<string, object>)
                            : null;
                        if (existingDoc != null)
                        {
                            string existingSource = ReadString(existingDoc, "source", "");
                            string existingConvId = ReadString(existingDoc, "conversationId", "");
                            string existingTitle = ReadString(existingDoc, "title", "").Trim();
                            long existingTs = ReadLong(existingDoc, "updatedAtMs", 0);
                            long nowMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                            if (string.Equals(existingSource, "sidecar_focus", StringComparison.Ordinal) &&
                                !string.IsNullOrEmpty(existingConvId))
                            {
                                if (existingTs > 0 && (nowMs - existingTs) < 3000)
                                {
                                    return;
                                }
                                if (!isNewConversation && string.Equals(existingTitle, t, StringComparison.OrdinalIgnoreCase))
                                {
                                    _lastViewKey = key;
                                    _lastViewWorkspace = ws;
                                    _lastViewTitle = t;
                                    return;
                                }
                            }
                        }
                    }
                }
                catch { }

                _lastViewKey = key;
                _lastViewWorkspace = ws;
                _lastViewTitle = t;

                long epochMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                var payload = new Dictionary<string, object>
                {
                    { "workspace", ws },
                    { "title", t },
                    { "isNewConversation", isNewConversation },
                    { "source", "uia_header" },
                    { "updatedAtMs", epochMs }
                };
                string tmp = _hudActiveViewPath + ".tmp";
                File.WriteAllText(tmp, localJson.Serialize(payload), Encoding.UTF8);
                try
                {
                    if (File.Exists(_hudActiveViewPath))
                    {
                        File.Replace(tmp, _hudActiveViewPath, null);
                    }
                    else
                    {
                        File.Move(tmp, _hudActiveViewPath);
                    }
                }
                catch
                {
                    File.Copy(tmp, _hudActiveViewPath, true);
                    try { File.Delete(tmp); } catch { }
                }
            }
            catch { }
        }

        private void StartUiaAnchorWorker()
        {
            int selfPid = _selfPid;
            _uiaWorkerThread = new Thread(delegate()
            {
                bool prevMouseDownOnHost = false;
                Native.POINT prevCursorPt = new Native.POINT();
                bool hasPrevCursor = false;
                IntPtr prevFgHwnd = IntPtr.Zero;
                DateTime lastInputUtc = DateTime.UtcNow;
                int uiaScanCycles = 0;
                while (!_disposed)
                {
                    bool mouseDownOnHost = false;
                    bool clickJustReleased = false;
                    bool typingNewlineKey = false;
                    bool userActiveNow = false;
                    bool isFgTracked = false;
                    bool anyOccluded = false;
                    bool useZeroUia = true;
                    bool hudWantActive = false;
                    try
                    {
                        var snapHwnds = new List<IntPtr>();
                        var snapCachedEl = new List<AutomationElement>();
                        var snapCachedKind = new List<int>();
                        var snapCachedLeft = new List<AutomationElement>();
                        var snapCachedBox = new List<AutomationElement>();
                        var snapLastScan = new List<DateTime>();
                        var snapLastOcc = new List<DateTime>();
                        var snapPrevAnchor = new List<HudAnchorInfo>();
                        var snapPrevOccReason = new List<string>();
                        var snapMissCount = new List<int>();
                        var snapHudHwnd = new List<IntPtr>();
                        var snapBackdropHwnd = new List<IntPtr>();
                        bool cdpTakesHud = false;
                        bool snapConsoleVis = false;
                        int snapConsolePhysW = 0;

                        // Single cross-thread UI snapshot per tick (eliminates N+1 blocking Dispatcher.Invoke calls!)
                        _dispatcher.Invoke(new Action(delegate
                        {
                            cdpTakesHud = _hudTelemetry != null && _hudTelemetry.cdpHudActive;
                            useZeroUia = _config != null && _config.zeroUiaMode;
                            hudWantActive = _config != null && _config.hudEnabled && _hudEnabledByTray && !_pausedByTray && !cdpTakesHud;
                            long vpNowMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                            bool vpFresh = _consoleViewportVisible && _consoleViewportPhysW > 0 && _consoleViewportUpdatedMs > 0 && (vpNowMs - _consoleViewportUpdatedMs) <= 10000;
                            snapConsoleVis = vpFresh;
                            snapConsolePhysW = vpFresh ? _consoleViewportPhysW : 0;
                            if (cdpTakesHud) return;
                            foreach (TrackedHostWindow rec in _tracked.Values)
                            {
                                if (useZeroUia && (rec.CachedUiaAnchor != null || rec.CachedLeftGuard != null || rec.CachedComposerBox != null))
                                {
                                    rec.CachedUiaAnchor = null;
                                    rec.CachedUiaAnchorKind = 0;
                                    rec.CachedLeftGuard = null;
                                    rec.CachedComposerBox = null;
                                }
                                if (Native.IsWindow(rec.Hwnd) && Native.IsWindowVisible(rec.Hwnd) && !Native.IsIconic(rec.Hwnd))
                                {
                                    snapHwnds.Add(rec.Hwnd);
                                    snapCachedEl.Add(useZeroUia ? null : rec.CachedUiaAnchor);
                                    snapCachedKind.Add(useZeroUia ? 0 : rec.CachedUiaAnchorKind);
                                    snapCachedLeft.Add(useZeroUia ? null : rec.CachedLeftGuard);
                                    snapCachedBox.Add(useZeroUia ? null : rec.CachedComposerBox);
                                    snapLastScan.Add(rec.LastFullUiaScanUtc);
                                    snapLastOcc.Add(rec.LastOcclusionCheckUtc);
                                    snapPrevAnchor.Add(rec.Anchor);
                                    snapPrevOccReason.Add(rec.LastOccludedReason ?? "");
                                    snapMissCount.Add(rec.AnchorMissCount);
                                    snapHudHwnd.Add(rec.Hud != null ? rec.Hud.Handle : IntPtr.Zero);
                                    snapBackdropHwnd.Add(rec.Backdrop != null ? rec.Backdrop.Handle : IntPtr.Zero);
                                }
                            }
                        }));

                        if (cdpTakesHud || snapHwnds.Count == 0)
                        {
                            prevMouseDownOnHost = false;
                            try { _uiaWakeEvent.WaitOne(1000); } catch { Thread.Sleep(1000); }
                            continue;
                        }

                        DateTime loopNow = DateTime.UtcNow;
                        IntPtr fgHwnd = Native.GetForegroundWindow();
                        isFgTracked = fgHwnd != IntPtr.Zero && snapHwnds.Contains(fgHwnd);
                        if (fgHwnd != prevFgHwnd)
                        {
                            prevFgHwnd = fgHwnd;
                            if (isFgTracked) lastInputUtc = loopNow;
                        }

                        if (hudWantActive)
                        {
                            Native.POINT curPt;
                            if (Native.GetCursorPos(out curPt))
                            {
                                if (!hasPrevCursor || curPt.X != prevCursorPt.X || curPt.Y != prevCursorPt.Y)
                                {
                                    prevCursorPt = curPt;
                                    hasPrevCursor = true;
                                    if (isFgTracked) lastInputUtc = loopNow;
                                }
                            }

                            bool leftButtonDown = (Native.GetAsyncKeyState(Native.VK_LBUTTON) & 0x8000) != 0;
                            mouseDownOnHost = isFgTracked && leftButtonDown;
                            clickJustReleased = prevMouseDownOnHost && !mouseDownOnHost;

                            // Detect Enter / Backspace typing activity so multiline composer height changes follow immediately
                            if (isFgTracked && !mouseDownOnHost)
                            {
                                bool enterDown = (Native.GetAsyncKeyState(Native.VK_RETURN) & 0x8001) != 0;
                                bool backDown = (Native.GetAsyncKeyState(Native.VK_BACK) & 0x8001) != 0;
                                if (enterDown || backDown)
                                {
                                    typingNewlineKey = true;
                                    lastInputUtc = loopNow;
                                    DateTime typeBoost = loopNow.AddMilliseconds(450);
                                    if (typeBoost > _fastTrackUntilUtc) _fastTrackUntilUtc = typeBoost;
                                }
                            }

                            if (mouseDownOnHost)
                            {
                                lastInputUtc = loopNow;
                                DateTime boost = loopNow.AddMilliseconds(450);
                                if (boost > _fastTrackUntilUtc) _fastTrackUntilUtc = boost;
                            }
                            else if (clickJustReleased)
                            {
                                lastInputUtc = loopNow;
                                DateTime postBoost = loopNow.AddMilliseconds(600);
                                if (postBoost > _fastTrackUntilUtc) _fastTrackUntilUtc = postBoost;
                                // Defer breadcrumb probe ~220ms so Electron finishes rendering the newly selected conversation header
                                Native.RECT fgRect;
                                if (hasPrevCursor && fgHwnd != IntPtr.Zero && Native.TryGetVisibleBounds(fgHwnd, out fgRect))
                                {
                                    double fgDpi = Native.GetWindowDpiScale(fgHwnd);
                                    if (prevCursorPt.X < fgRect.Left + (int)Math.Round(360 * fgDpi) || prevCursorPt.Y < fgRect.Top + (int)Math.Round(110 * fgDpi))
                                    {
                                        _pendingViewProbeAtUtc = loopNow.AddMilliseconds(220);
                                    }
                                }
                            }
                            prevMouseDownOnHost = mouseDownOnHost;
                            userActiveNow = isFgTracked && ((loopNow - lastInputUtc).TotalMilliseconds < 700.0 || loopNow < _fastTrackUntilUtc);
                        }
                        else
                        {
                            prevMouseDownOnHost = false;
                        }

                        bool pendingDue = loopNow >= _pendingViewProbeAtUtc;
                        bool explicitViewTrigger = _forceViewProbe || pendingDue;
                        // Avoid blind 12s full-DOM FindAll scans while idle: passive safety refresh runs every 60s only when foreground
                        bool wantViewProbe = !mouseDownOnHost && (explicitViewTrigger || (isFgTracked && (loopNow - _lastViewProbeUtc).TotalMilliseconds >= 60000));

                        for (int idx = 0; idx < snapHwnds.Count; idx++)
                        {
                            if (_disposed) break;
                            IntPtr h = snapHwnds[idx];
                            Native.RECT winRect;
                            if (!Native.TryGetVisibleBounds(h, out winRect)) continue;

                            AutomationElement cachedEl = snapCachedEl[idx];
                            int cachedKind = snapCachedKind[idx];
                            AutomationElement cachedLeft = snapCachedLeft[idx];
                            AutomationElement cachedBox = snapCachedBox[idx];
                            DateTime lastScan = snapLastScan[idx];
                            DateTime lastOccCheck = snapLastOcc[idx];
                            HudAnchorInfo prevAnchor = snapPrevAnchor[idx];
                            string prevOccReason = snapPrevOccReason[idx];
                            int missCount = snapMissCount[idx];
                            IntPtr hudHwnd = snapHudHwnd[idx];
                            IntPtr backdropHwnd = snapBackdropHwnd[idx];

                            double rescanCooldownMs = clickJustReleased ? 220.0 : (mouseDownOnHost ? 320.0 : (isFgTracked ? 1200.0 : 4000.0));
                            bool canProbeAnchor = hudWantActive && (useZeroUia || cachedEl != null || (loopNow - lastScan).TotalMilliseconds >= rescanCooldownMs);
                            if (canProbeAnchor)
                            {
                                bool hadCached = cachedEl != null;
                                HudAnchorInfo anchor = useZeroUia
                                    ? UiaHelper.ComputePureWin32ComposerAnchor(h, winRect, snapConsoleVis, snapConsolePhysW)
                                    : UiaHelper.ProbeComposerAnchor(h, winRect, selfPid, ref cachedEl, ref cachedKind, ref cachedLeft, ref cachedBox);
                                DateTime scanTime = (!hadCached || cachedEl == null) ? DateTime.UtcNow : lastScan;

                                HudAnchorInfo finalAnchor = anchor;
                                int nextMissCount = 0;
                                DateTime nextOccCheck = lastOccCheck;
                                string occReason = "";

                                if (anchor.HasAnchor && anchor.ComposerVisible)
                                {
                                    nextMissCount = 0;
                                    if (mouseDownOnHost)
                                    {
                                        // Preserve current occlusion state during mouse-down/drag:
                                        // stays visible during splitter drag, and stays hidden when already covered by full-screen Console/menus
                                        finalAnchor.Occluded = prevAnchor.Occluded;
                                        occReason = prevOccReason;
                                    }
                                    else
                                    {
                                        // Adaptive occlusion interval:
                                        // Zero-UIA mode runs pure-Win32 Z-order ONLY (0 COM UIA RPCs, never triggers Electron AXTree!)
                                        double occIntervalMs = userActiveNow ? 160.0 : (prevAnchor.Occluded ? 240.0 : 750.0);
                                        bool freshAnchorVerify = !useZeroUia && !hadCached && cachedEl != null;
                                        bool runUiaChecks = !useZeroUia && (freshAnchorVerify || (isFgTracked && (clickJustReleased || typingNewlineKey || (loopNow - lastOccCheck).TotalMilliseconds >= occIntervalMs)));
                                        if (runUiaChecks)
                                        {
                                            nextOccCheck = loopNow;
                                            uiaScanCycles++;
                                        }
                                        finalAnchor.Occluded = UiaHelper.IsHudOccluded(h, hudHwnd, backdropHwnd, selfPid, winRect, anchor, cachedEl, cachedLeft, runUiaChecks, prevAnchor.Occluded, prevOccReason, out occReason);

                                        // Self-heal when cached anchor belongs to a background conversation Document after switching tabs:
                                        // invalidate stale cachedEl (throttled: 650ms on fresh hit, 2500ms backoff if still covered) and immediately re-probe!
                                        bool isStaleDocCover =
                                            string.Equals(occReason, "anchor-covered-doc", StringComparison.Ordinal) ||
                                            string.Equals(occReason, "anchor-covered", StringComparison.Ordinal);
                                        bool wasAlreadyDocCover =
                                            string.Equals(prevOccReason, "anchor-covered-doc", StringComparison.Ordinal) ||
                                            string.Equals(prevOccReason, "anchor-covered", StringComparison.Ordinal);
                                        double selfHealCooldownMs = (wasAlreadyDocCover && !clickJustReleased) ? 2500.0 : 650.0;
                                        if (!useZeroUia && finalAnchor.Occluded && isStaleDocCover &&
                                            hadCached && cachedEl != null &&
                                            (loopNow - lastScan).TotalMilliseconds >= selfHealCooldownMs)
                                        {
                                            cachedEl = null;
                                            cachedKind = 0;
                                            cachedLeft = null;
                                            cachedBox = null;
                                            scanTime = DateTime.UtcNow;
                                            HudAnchorInfo healed = UiaHelper.ProbeComposerAnchor(h, winRect, selfPid, ref cachedEl, ref cachedKind, ref cachedLeft, ref cachedBox);
                                            if (healed.HasAnchor && healed.ComposerVisible)
                                            {
                                                string healedOccReason;
                                                bool healedOcc = UiaHelper.IsHudOccluded(h, hudHwnd, backdropHwnd, selfPid, winRect, healed, cachedEl, cachedLeft, true, false, "", out healedOccReason);
                                                healed.Occluded = healedOcc;
                                                finalAnchor = healed;
                                                occReason = healedOccReason;
                                                nextOccCheck = DateTime.UtcNow;
                                            }
                                        }
                                    }
                                    if (finalAnchor.Occluded) anyOccluded = true;
                                }
                                else
                                {
                                    nextMissCount = missCount + 1;
                                    // Tight 1-frame grace period avoids hovering half a second in mid-air during view switches
                                    if (prevAnchor.HasAnchor && nextMissCount < 2)
                                    {
                                        finalAnchor = prevAnchor;
                                    }
                                }

                                bool anchorChanged =
                                    finalAnchor.HasAnchor != prevAnchor.HasAnchor ||
                                    finalAnchor.ComposerVisible != prevAnchor.ComposerVisible ||
                                    finalAnchor.Occluded != prevAnchor.Occluded ||
                                    finalAnchor.RightX != prevAnchor.RightX ||
                                    finalAnchor.LeftGuardX != prevAnchor.LeftGuardX ||
                                    finalAnchor.CenterY != prevAnchor.CenterY ||
                                    finalAnchor.FromUia != prevAnchor.FromUia ||
                                    !string.Equals(occReason, prevOccReason, StringComparison.Ordinal) ||
                                    nextMissCount != missCount ||
                                    hadCached != (cachedEl != null) ||
                                    scanTime != lastScan ||
                                    nextOccCheck != lastOccCheck;

                                bool needsHudSync =
                                    finalAnchor.HasAnchor != prevAnchor.HasAnchor ||
                                    finalAnchor.ComposerVisible != prevAnchor.ComposerVisible ||
                                    finalAnchor.Occluded != prevAnchor.Occluded ||
                                    finalAnchor.RightX != prevAnchor.RightX ||
                                    finalAnchor.LeftGuardX != prevAnchor.LeftGuardX ||
                                    finalAnchor.CenterY != prevAnchor.CenterY;

                                if (anchorChanged && !_disposed)
                                {
                                    IntPtr targetH = h;
                                    _dispatcher.BeginInvoke(new Action(delegate
                                    {
                                        TrackedHostWindow rec;
                                        if (!_disposed && _tracked.TryGetValue(targetH, out rec))
                                        {
                                            rec.CachedUiaAnchor = cachedEl;
                                            rec.CachedUiaAnchorKind = cachedKind;
                                            rec.CachedLeftGuard = cachedLeft;
                                            rec.CachedComposerBox = cachedBox;
                                            rec.LastFullUiaScanUtc = scanTime;
                                            rec.LastOcclusionCheckUtc = nextOccCheck;
                                            rec.LastOccludedReason = occReason;
                                            rec.AnchorMissCount = nextMissCount;
                                            rec.Anchor = finalAnchor;
                                            if (!needsHudSync) return;
                                            if (_inSync)
                                            {
                                                _syncPending = true;
                                            }
                                            else
                                            {
                                                bool prevInSync = _inSync;
                                                _inSync = true;
                                                try
                                                {
                                                    Native.RECT freshRect;
                                                    if (Native.TryGetVisibleBounds(targetH, out freshRect))
                                                    {
                                                        SyncHudForWindow(rec, freshRect, null);
                                                    }
                                                    else
                                                    {
                                                        HideHudIfVisible(rec);
                                                    }
                                                }
                                                catch { }
                                                finally
                                                {
                                                    _inSync = prevInSync;
                                                    if (_syncPending && !_inSync && !_disposed && _debounceTimer != null && !_debounceTimer.IsEnabled)
                                                    {
                                                        _syncPending = false;
                                                        _debounceTimer.Start();
                                                    }
                                                }
                                            }
                                        }
                                    }));
                                }
                            }

                            // Probe active conversation breadcrumb for each visible window (pure Win32 title in Zero-UIA mode!)
                            if (wantViewProbe)
                            {
                                ActiveViewInfo view = useZeroUia
                                    ? UiaHelper.ProbeActiveConversationTitlePureWin32(h)
                                    : UiaHelper.ProbeActiveConversationView(h, winRect);
                                if (!useZeroUia) uiaScanCycles += 4;
                                if (view.IsNewConversation || !string.IsNullOrEmpty(view.Title))
                                {
                                    string vwWs = view.Workspace ?? "";
                                    string vwTitle = view.Title ?? "";
                                    bool vwIsNew = view.IsNewConversation;
                                    IntPtr targetH = h;
                                    bool writeView = (h == fgHwnd || snapHwnds.Count == 1);
                                    if (!_disposed)
                                    {
                                        _dispatcher.BeginInvoke(new Action(delegate
                                        {
                                            TrackedHostWindow rec;
                                            if (_disposed || !_tracked.TryGetValue(targetH, out rec)) return;

                                            // Validate UIA header title against known real sessions so scrolled chat text
                                            // (like "Analyzed" or code snippets) can NEVER hijack or freeze the HUD!
                                            bool knownMatch = vwIsNew || MatchesAnyKnownSession(vwTitle, vwWs);
                                            if (!knownMatch)
                                            {
                                                if (!string.IsNullOrEmpty(rec.WindowTitle) && !MatchesAnyKnownSession(rec.WindowTitle, rec.WindowWorkspace))
                                                {
                                                    rec.WindowTitle = "";
                                                    rec.WindowWorkspace = "";
                                                    rec.WindowIsNewConv = false;
                                                    if (rec.Hud != null)
                                                    {
                                                        rec.Hud.UpdateData(ResolveTelemetryForWindow(rec), _config.accentColor);
                                                    }
                                                }
                                                return;
                                            }

                                            bool viewChanged =
                                                rec.WindowIsNewConv != vwIsNew ||
                                                !string.Equals(rec.WindowTitle, vwTitle, StringComparison.Ordinal) ||
                                                !string.Equals(rec.WindowWorkspace, vwWs, StringComparison.Ordinal);
                                            rec.WindowWorkspace = vwWs;
                                            rec.WindowTitle = vwTitle;
                                            rec.WindowIsNewConv = vwIsNew;
                                            rec.WindowViewUpdatedUtc = DateTime.UtcNow;
                                            if (viewChanged && rec.Hud != null)
                                            {
                                                rec.Hud.UpdateData(ResolveTelemetryForWindow(rec), _config.accentColor);
                                            }
                                            if (writeView)
                                            {
                                                WriteActiveViewFile(vwWs, vwTitle, vwIsNew, explicitViewTrigger);
                                            }
                                        }));
                                    }
                                }
                            }
                        }

                        if (wantViewProbe)
                        {
                            _forceViewProbe = false;
                            _pendingViewProbeAtUtc = DateTime.MaxValue;
                            _lastViewProbeUtc = DateTime.UtcNow;
                        }

                        // Periodically reclaim transient UIA COM RCW wrappers (Gen-2 + Finalizers + WorkingSet trim)
                        if (uiaScanCycles >= 45 && !mouseDownOnHost)
                        {
                            uiaScanCycles = 0;
                            Native.TrimWorkingSet();
                        }
                    }
                    catch { }

                    int waitMs;
                    if (!hudWantActive) waitMs = 2000;
                    else if (mouseDownOnHost || typingNewlineKey) waitMs = useZeroUia ? 250 : 32;
                    else if (userActiveNow) waitMs = useZeroUia ? 250 : 120;
                    else if (!isFgTracked) waitMs = 600;
                    else if (anyOccluded) waitMs = 240;
                    else waitMs = 500;
                    try { _uiaWakeEvent.WaitOne(waitMs); } catch { Thread.Sleep(waitMs); }
                }
            });
            _uiaWorkerThread.IsBackground = true;
            _uiaWorkerThread.SetApartmentState(ApartmentState.MTA);
            _uiaWorkerThread.Start();
        }

        private void InstallSystemEvents()
        {
            if (_systemEventsHooked) return;
            try
            {
                SystemEvents.PowerModeChanged += OnPowerModeChanged;
                SystemEvents.SessionSwitch += OnSessionSwitch;
                _systemEventsHooked = true;
            }
            catch { }
        }

        private void UninstallSystemEvents()
        {
            if (!_systemEventsHooked) return;
            _systemEventsHooked = false;
            try { SystemEvents.PowerModeChanged -= OnPowerModeChanged; } catch { }
            try { SystemEvents.SessionSwitch -= OnSessionSwitch; } catch { }
        }

        private void OnPowerModeChanged(object sender, PowerModeChangedEventArgs e)
        {
            if (_disposed || e == null) return;
            if (e.Mode == PowerModes.Suspend)
            {
                // Restore full host opacity & hide backdrops before sleep so wake-up never shows stuck ghost translucency
                try
                {
                    _dispatcher.BeginInvoke(new Action(delegate
                    {
                        if (_disposed) return;
                        CloseHudPopup();
                        foreach (TrackedHostWindow item in _tracked.Values)
                        {
                            RestoreBackdropOnly(item, false);
                            HideHudIfVisible(item);
                        }
                        ReleaseSharedWallpaperBitmaps();
                    }));
                }
                catch { RestoreAllHostOpacityEmergency(); }
            }
            else if (e.Mode == PowerModes.Resume)
            {
                ScheduleResumeResync();
            }
        }

        private void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
        {
            if (_disposed || e == null) return;
            if (e.Reason == SessionSwitchReason.SessionLock || e.Reason == SessionSwitchReason.ConsoleDisconnect)
            {
                try
                {
                    _dispatcher.BeginInvoke(new Action(delegate
                    {
                        if (_disposed) return;
                        CloseHudPopup();
                        foreach (TrackedHostWindow item in _tracked.Values)
                        {
                            RestoreBackdropOnly(item, false);
                            HideHudIfVisible(item);
                        }
                        ReleaseSharedWallpaperBitmaps();
                    }));
                }
                catch { RestoreAllHostOpacityEmergency(); }
            }
            else if (e.Reason == SessionSwitchReason.SessionUnlock || e.Reason == SessionSwitchReason.ConsoleConnect)
            {
                ScheduleResumeResync();
            }
        }

        private void ScheduleResumeResync()
        {
            try
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    if (_disposed) return;
                    foreach (TrackedHostWindow item in _tracked.Values)
                    {
                        item.BackdropGuardBlocked = false;
                        item.BackdropBlockReason = "";
                        item.BackdropZFailCount = 0;
                    }
                    var t1 = new DispatcherTimer(DispatcherPriority.Background, _dispatcher)
                    {
                        Interval = TimeSpan.FromMilliseconds(500)
                    };
                    t1.Tick += delegate
                    {
                        t1.Stop();
                        if (!_disposed)
                        {
                            SyncAllWindows(true);
                            WriteStatusFile(true);
                        }
                    };
                    t1.Start();

                    var t2 = new DispatcherTimer(DispatcherPriority.Background, _dispatcher)
                    {
                        Interval = TimeSpan.FromMilliseconds(1800)
                    };
                    t2.Tick += delegate
                    {
                        t2.Stop();
                        if (!_disposed)
                        {
                            SyncAllWindows(true);
                            WriteStatusFile(true);
                        }
                    };
                    t2.Start();
                }));
            }
            catch { }
        }

        public void RecoverFromNonFatalUiException()
        {
            try { CloseHudPopup(); } catch { }
            try
            {
                if (_lightbox != null)
                {
                    ImageLightboxWindow closingLb = _lightbox;
                    _lightbox = null;
                    _lightboxOwnerHwnd = IntPtr.Zero;
                    ForceCloseOwnedWindow(closingLb);
                }
            }
            catch { }
            try { SyncAllWindows(true); } catch { RestoreAllHostOpacityEmergency(); }
        }

        private void InstallHooks()
        {
            _winEventDelegate = OnWinEvent;
            uint flags = Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS;
            IntPtr fgHook = Native.SetWinEventHook(
                Native.EVENT_SYSTEM_FOREGROUND,
                Native.EVENT_SYSTEM_FOREGROUND,
                IntPtr.Zero,
                _winEventDelegate,
                0,
                0,
                flags
            );
            if (fgHook != IntPtr.Zero) _hooks.Add(fgHook);
            SyncHostPidHooks();
        }

        private void SyncHostPidHooks()
        {
            if (_disposed || _winEventDelegate == null) return;
            var activePids = new HashSet<uint>();
            foreach (IntPtr hwnd in _tracked.Keys)
            {
                if (!Native.IsWindow(hwnd)) continue;
                uint pid = 0;
                Native.GetWindowThreadProcessId(hwnd, out pid);
                if (pid != 0 && pid != (uint)_selfPid)
                {
                    activePids.Add(pid);
                }
            }

            var stalePids = new List<uint>();
            foreach (uint pid in _hostPidHooks.Keys)
            {
                if (!activePids.Contains(pid)) stalePids.Add(pid);
            }
            for (int i = 0; i < stalePids.Count; i++)
            {
                uint pid = stalePids[i];
                List<IntPtr> list;
                if (_hostPidHooks.TryGetValue(pid, out list))
                {
                    for (int j = 0; j < list.Count; j++)
                    {
                        try { Native.UnhookWinEvent(list[j]); } catch { }
                    }
                    _hostPidHooks.Remove(pid);
                }
            }

            uint[] hostEvents = new uint[]
            {
                Native.EVENT_SYSTEM_MOVESIZESTART,
                Native.EVENT_SYSTEM_MOVESIZEEND,
                Native.EVENT_SYSTEM_MINIMIZESTART,
                Native.EVENT_SYSTEM_MINIMIZEEND
            };
            uint flags = Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS;
            foreach (uint pid in activePids)
            {
                if (_hostPidHooks.ContainsKey(pid)) continue;
                var pidHooks = new List<IntPtr>(hostEvents.Length);
                for (int i = 0; i < hostEvents.Length; i++)
                {
                    IntPtr h = Native.SetWinEventHook(hostEvents[i], hostEvents[i], IntPtr.Zero, _winEventDelegate, pid, 0, flags);
                    if (h != IntPtr.Zero) pidHooks.Add(h);
                }
                _hostPidHooks[pid] = pidHooks;
            }
        }

        private void OnWinEvent(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime)
        {
            // Strictly require OBJID_WINDOW (0) AND CHILDID_SELF (0) so child DOM/UIA hides in Chromium never hide our backdrop!
            if (_disposed || hwnd == IntPtr.Zero || idObject != 0 || idChild != 0) return;

            bool isTracked = _tracked.ContainsKey(hwnd);
            if (eventType == Native.EVENT_OBJECT_LOCATIONCHANGE && isTracked)
            {
                TrackedHostWindow locItem;
                Native.RECT lr;
                if (!_tracked.TryGetValue(hwnd, out locItem) || !Native.TryGetVisibleBounds(hwnd, out lr))
                {
                    return;
                }
                int lw = Math.Max(1, lr.Right - lr.Left);
                int lh = Math.Max(1, lr.Bottom - lr.Top);
                if (locItem.BackdropVisible && lr.Left == locItem.LastLeft && lr.Top == locItem.LastTop && lw == locItem.LastWidth && lh == locItem.LastHeight)
                {
                    return;
                }
                if (hwnd == _moveSizingHwnd)
                {
                    _renderFollowLastRect = lr;
                    _renderFollowLastChangeUtc = DateTime.UtcNow;
                }
                if (eventType == Native.EVENT_OBJECT_LOCATIONCHANGE && isTracked && !_inSync)
                {
                    SyncAllWindows(false);
                }
                else
                {
                    _syncPending = true;
                }
                return;
            }

            if (eventType == Native.EVENT_SYSTEM_FOREGROUND || isTracked)
            {
                if (eventType == Native.EVENT_SYSTEM_FOREGROUND && _hudPopup != null && !_hudPopupOpening && hwnd != _hudPopupOwnerHwnd)
                {
                    IntPtr popH = _hudPopup.Handle;
                    IntPtr guideH = IntPtr.Zero;
                    try
                    {
                        if (_hudPopup.GuideWindow != null)
                        {
                            guideH = new WindowInteropHelper(_hudPopup.GuideWindow).Handle;
                        }
                    }
                    catch { }
                    if (hwnd != popH && hwnd != guideH)
                    {
                        CloseHudPopup();
                    }
                }

                // Immediate zero-debounce hide ONLY when host window is actually minimized, hidden, cloaked, or destroyed!
                // Never hide backdrop on spurious Chromium child/transient EVENT_OBJECT_HIDE when the top-level window is still visible.
                if (isTracked && (eventType == Native.EVENT_SYSTEM_MINIMIZESTART || eventType == Native.EVENT_OBJECT_HIDE || eventType == Native.EVENT_OBJECT_DESTROY))
                {
                    bool actuallyGone =
                        eventType == Native.EVENT_SYSTEM_MINIMIZESTART ||
                        !Native.IsWindow(hwnd) ||
                        !Native.IsWindowVisible(hwnd) ||
                        Native.IsIconic(hwnd) ||
                        Native.IsWindowCloaked(hwnd);
                    if (!actuallyGone)
                    {
                        return;
                    }
                    TrackedHostWindow item;
                    if (_tracked.TryGetValue(hwnd, out item))
                    {
                        HideHudIfVisible(item);
                        if (item.Backdrop != null && item.BackdropVisible && item.Backdrop.Handle != IntPtr.Zero)
                        {
                            Native.ShowWindow(item.Backdrop.Handle, Native.SW_HIDE);
                            item.BackdropVisible = false;
                            _backdropHideCount++;
                            _backdropLastHideReason = "winevent-" + eventType.ToString("X");
                        }
                    }
                    if (_moveSizingHwnd == hwnd) StopRenderFollow();
                    return;
                }

                if (isTracked && eventType == Native.EVENT_SYSTEM_MOVESIZESTART)
                {
                    StartRenderFollow(hwnd);
                }
                else if (isTracked && eventType == Native.EVENT_SYSTEM_MOVESIZEEND)
                {
                    StopRenderFollow();
                }

                bool probeView = eventType == Native.EVENT_SYSTEM_FOREGROUND || eventType == Native.EVENT_SYSTEM_MOVESIZEEND;
                bool hudWantActive = _config != null && _config.hudEnabled && _hudEnabledByTray && !_pausedByTray;
                if (hudWantActive)
                {
                    TriggerFastUiaBurst(550, probeView);
                }
                else if (probeView)
                {
                    _forceViewProbe = true;
                }
                if (eventType == Native.EVENT_SYSTEM_FOREGROUND && isTracked)
                {
                    SetFastStateIntervalMs(150);
                }
                if (!_inSync && (eventType == Native.EVENT_SYSTEM_FOREGROUND || eventType == Native.EVENT_SYSTEM_MINIMIZEEND || eventType == Native.EVENT_OBJECT_SHOW || eventType == Native.EVENT_SYSTEM_MOVESIZEEND))
                {
                    SyncAllWindows(false);
                }
                else
                {
                    if (_inSync) _syncPending = true;
                    if (_debounceTimer != null && !_debounceTimer.IsEnabled)
                    {
                        _debounceTimer.Start();
                    }
                }
            }
        }

        private static bool IsTargetFile(string name, string expected)
        {
            return !string.IsNullOrEmpty(name) &&
                string.Equals(System.IO.Path.GetFileName(name), expected, StringComparison.OrdinalIgnoreCase);
        }

        private void InstallWatcher()
        {
            try
            {
                // Watch all files in _dataDir so atomic renames (*.tmp.* -> target.json) are always caught
                _watcher = new FileSystemWatcher(_dataDir, "*");
                _watcher.NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.CreationTime | NotifyFilters.FileName | NotifyFilters.Size;
                _watcher.Changed += OnDataFileEvent;
                _watcher.Created += OnDataFileEvent;
                _watcher.Renamed += delegate(object s, RenamedEventArgs re)
                {
                    HandleDataFileName(re.Name);
                    HandleDataFileName(re.OldName);
                };
                _watcher.EnableRaisingEvents = true;
            }
            catch { }
        }

        private void OnDataFileEvent(object sender, FileSystemEventArgs e)
        {
            if (e != null) HandleDataFileName(e.Name);
        }

        private void HandleDataFileName(string name)
        {
            if (IsTargetFile(name, "themes.json"))
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    if (_disposed) return;
                    ReloadThemeConfig(false);
                    SyncAllWindows(false);
                    WriteStatusFile(true);
                }));
            }
            else if (IsTargetFile(name, "hud_telemetry.json"))
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    if (_disposed) return;
                    ReloadHudTelemetry();
                    PushHudTelemetryToWindows();
                }));
            }
            else if (IsTargetFile(name, "hud_display.json"))
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    if (_disposed) return;
                    ReloadHudDisplayConfig();
                    PushHudDisplayToWindows();
                }));
            }
            else if (IsTargetFile(name, "console_viewport.json"))
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    if (_disposed) return;
                    ReloadConsoleViewport();
                    TriggerFastUiaBurst(250, false);
                    SyncAllWindows(false);
                }));
            }
            else if (IsTargetFile(name, "lightbox_cmd.json"))
            {
                _dispatcher.BeginInvoke(new Action(delegate
                {
                    if (_disposed) return;
                    HandleLightboxCommandFile();
                }));
            }
        }

        private void CheckDataFilesTimestamp()
        {
            try
            {
                if (File.Exists(_themesPath))
                {
                    var info = new FileInfo(_themesPath);
                    if (info.LastWriteTimeUtc != _lastThemesWriteUtc || info.Length != _lastThemesLength)
                    {
                        ReloadThemeConfig(false);
                        SyncAllWindows(false);
                        WriteStatusFile(true);
                    }
                }
            }
            catch { }

            try
            {
                if (File.Exists(_hudTelemetryPath))
                {
                    var info = new FileInfo(_hudTelemetryPath);
                    if (info.LastWriteTimeUtc != _lastHudWriteUtc || info.Length != _lastHudLength)
                    {
                        ReloadHudTelemetry();
                        PushHudTelemetryToWindows();
                    }
                }
            }
            catch { }

            try
            {
                if (File.Exists(_hudDisplayPath))
                {
                    var info = new FileInfo(_hudDisplayPath);
                    if (info.LastWriteTimeUtc != _lastHudDisplayWriteUtc || info.Length != _lastHudDisplayLength)
                    {
                        ReloadHudDisplayConfig();
                        PushHudDisplayToWindows();
                    }
                }
            }
            catch { }

            try
            {
                if (File.Exists(_consoleViewportPath))
                {
                    var info = new FileInfo(_consoleViewportPath);
                    if (info.LastWriteTimeUtc != _lastConsoleViewportWriteUtc || info.Length != _lastConsoleViewportLength)
                    {
                        ReloadConsoleViewport();
                        TriggerFastUiaBurst(250, false);
                    }
                }
            }
            catch { }

            try
            {
                if (File.Exists(_lightboxCmdPath))
                {
                    var info = new FileInfo(_lightboxCmdPath);
                    if (info.LastWriteTimeUtc != _lastLightboxCmdWriteUtc || info.Length != _lastLightboxCmdLength)
                    {
                        HandleLightboxCommandFile();
                    }
                }
            }
            catch { }
        }

        private static bool IsAllowedRasterPath(string filePath)
        {
            if (string.IsNullOrEmpty(filePath)) return false;
            string ext = System.IO.Path.GetExtension(filePath);
            if (string.IsNullOrEmpty(ext)) return false;
            ext = ext.ToLowerInvariant();
            return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" || ext == ".gif" || ext == ".bmp";
        }

        private IntPtr PickTargetHostForLightbox()
        {
            IntPtr fg = Native.GetForegroundWindow();
            if (fg != IntPtr.Zero && _tracked.ContainsKey(fg) && Native.IsWindowVisible(fg) && !Native.IsIconic(fg))
            {
                return fg;
            }
            foreach (TrackedHostWindow item in _tracked.Values)
            {
                if (Native.IsWindow(item.Hwnd) && Native.IsWindowVisible(item.Hwnd) && !Native.IsIconic(item.Hwnd))
                {
                    return item.Hwnd;
                }
            }
            return IntPtr.Zero;
        }

        private void HandleLightboxCommandFile()
        {
            try
            {
                if (!File.Exists(_lightboxCmdPath)) return;
                var info = new FileInfo(_lightboxCmdPath);
                string raw = ReadTextWithRetry(_lightboxCmdPath);
                _lastLightboxCmdWriteUtc = info.LastWriteTimeUtc;
                _lastLightboxCmdLength = info.Length;
                if (string.IsNullOrEmpty(raw)) return;

                var doc = _json.DeserializeObject(raw) as Dictionary<string, object>;
                if (doc == null) return;

                string cmdId = ReadString(doc, "id", "");
                if (!string.IsNullOrEmpty(cmdId) && string.Equals(cmdId, _lastLightboxCmdId, StringComparison.Ordinal))
                {
                    return;
                }

                long tsMs = ReadLong(doc, "ts", 0);
                long nowMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                if (tsMs > 0 && Math.Abs(nowMs - tsMs) > 20000)
                {
                    _lastLightboxCmdId = cmdId;
                    return;
                }

                string imgPath = ReadString(doc, "path", "");
                string label = ReadString(doc, "label", "");
                _lastLightboxCmdId = cmdId;

                if (!IsAllowedRasterPath(imgPath) || !File.Exists(imgPath)) return;
                OpenNativeLightbox(imgPath, label);
            }
            catch { }
        }

        private void OpenNativeLightbox(string imgPath, string label)
        {
            CloseHudPopup();
            IntPtr ownerHwnd = PickTargetHostForLightbox();
            if (ownerHwnd == IntPtr.Zero) return;

            Native.RECT winRect;
            if (!Native.TryGetVisibleBounds(ownerHwnd, out winRect)) return;

            double dpiScale = Native.GetWindowDpiScale(ownerHwnd);
            bool isMaximized = Native.IsZoomed(ownerHwnd);

            if (_lightbox != null && _lightboxOwnerHwnd != ownerHwnd)
            {
                ImageLightboxWindow oldBox = _lightbox;
                _lightbox = null;
                _lightboxOwnerHwnd = IntPtr.Zero;
                ForceCloseOwnedWindow(oldBox);
            }

            if (_lightbox == null)
            {
                var win = new ImageLightboxWindow(ownerHwnd);
                // Bind BEFORE Show() so re-entrant events or SweepOrphanedWindows always recognize it
                _lightbox = win;
                _lightboxOwnerHwnd = ownerHwnd;
                win.Closed += delegate
                {
                    if (_lightbox == win)
                    {
                        _lightbox = null;
                        _lightboxOwnerHwnd = IntPtr.Zero;
                        if (!_disposed && _debounceTimer != null && !_debounceTimer.IsEnabled)
                        {
                            _debounceTimer.Start();
                        }
                    }
                };
                if (!win.LoadImage(imgPath, label))
                {
                    _lightbox = null;
                    _lightboxOwnerHwnd = IntPtr.Zero;
                    ForceCloseOwnedWindow(win);
                    return;
                }
                win.PositionOverBounds(winRect, dpiScale, isMaximized, _config.radius);
                win.Show();
                win.PositionOverBounds(winRect, dpiScale, isMaximized, _config.radius);
                Native.ForceActivateWindow(win.Handle);
                win.Activate();
                win.Focus();
                Keyboard.Focus(win);
            }
            else
            {
                if (!_lightbox.LoadImage(imgPath, label))
                {
                    return;
                }
                _lightbox.PositionOverBounds(winRect, dpiScale, isMaximized, _config.radius);
                if (!_lightbox.IsVisible) _lightbox.Show();
                Native.ForceActivateWindow(_lightbox.Handle);
                _lightbox.Activate();
                _lightbox.Focus();
                Keyboard.Focus(_lightbox);
            }

            foreach (TrackedHostWindow item in _tracked.Values)
            {
                HideHudIfVisible(item);
            }
        }

        private static string ReadTextWithRetry(string filePath)
        {
            for (int attempt = 0; attempt < 4; attempt++)
            {
                try
                {
                    using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (var sr = new StreamReader(fs, Encoding.UTF8))
                    {
                        return sr.ReadToEnd();
                    }
                }
                catch (IOException)
                {
                    if (attempt == 3) throw;
                    Thread.Sleep(8);
                }
            }
            return null;
        }

        private void ReloadConsoleViewport()
        {
            try
            {
                if (!File.Exists(_consoleViewportPath))
                {
                    _consoleViewportVisible = false;
                    _consoleViewportPhysW = 0;
                    _consoleViewportOuterW = 0;
                    _consoleViewportUpdatedMs = 0;
                    return;
                }
                var info = new FileInfo(_consoleViewportPath);
                string raw = ReadTextWithRetry(_consoleViewportPath);
                if (string.IsNullOrEmpty(raw)) return;
                _lastConsoleViewportWriteUtc = info.LastWriteTimeUtc;
                _lastConsoleViewportLength = info.Length;

                var doc = _json.DeserializeObject(raw) as Dictionary<string, object>;
                if (doc == null) return;

                _consoleViewportVisible = ReadBool(doc, "visible", false);
                _consoleViewportPhysW = Math.Max(0, ReadInt(doc, "physW", 0));
                _consoleViewportOuterW = Math.Max(0, ReadInt(doc, "outerW", 0));
                _consoleViewportUpdatedMs = ReadLong(doc, "updatedAtMs", 0);
            }
            catch { }
        }

        private bool IsConsoleCoveringAnchor(TrackedHostWindow item, Native.RECT winRect, double hostDpiScale)
        {
            if (item == null || !item.Anchor.HasAnchor || !_consoleViewportVisible || _consoleViewportPhysW <= 0)
            {
                return false;
            }
            long nowMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            if (_consoleViewportUpdatedMs <= 0 || (nowMs - _consoleViewportUpdatedMs) > 9500)
            {
                return false;
            }
            int winW = Math.Max(1, winRect.Right - winRect.Left);
            // Only true full-screen / wide-overlay AGY Console (>= 62% of host window width) can cover the chat composer!
            // Side-by-side split pane (~30%-55% width) never covers the composer and must not falsely trigger when user switches tabs to Overview.
            if (_consoleViewportPhysW < (int)Math.Round(winW * 0.62))
            {
                return false;
            }
            if (_tracked.Count > 1)
            {
                bool outerMatches = _consoleViewportOuterW > 0 && Math.Abs(winW - _consoleViewportOuterW) <= 80;
                bool isFg = Native.GetForegroundWindow() == item.Hwnd;
                if (!outerMatches && !isFg) return false;
            }

            int anchorW = Math.Max(1, item.Anchor.AnchorWinRight - item.Anchor.AnchorWinLeft);
            int projRightX;
            if (winW == anchorW)
            {
                projRightX = item.Anchor.RightX + (winRect.Left - item.Anchor.AnchorWinLeft);
            }
            else
            {
                double relRightFrac = Math.Max(0.05, Math.Min(0.98, (item.Anchor.RightX - item.Anchor.AnchorWinLeft) / (double)anchorW));
                projRightX = winRect.Left + (int)Math.Round(winW * relRightFrac);
            }

            // Side-by-side mode leaves >= 140 DIP of composer buttons (Turbo/Mic/Voice/Stop) between projRightX and consoleLeftPx;
            // Full-screen AGY Console (with or without left sidebar) sweeps consoleLeftPx far left of projRightX!
            int consoleLeftPx = winRect.Right - _consoleViewportPhysW;
            int padPx = (int)Math.Round(24.0 * Math.Max(0.75, hostDpiScale));
            return projRightX >= (consoleLeftPx - padPx);
        }

        private void ReloadHudDisplayConfig()
        {
            try
            {
                if (!File.Exists(_hudDisplayPath)) return;
                var info = new FileInfo(_hudDisplayPath);
                string raw = ReadTextWithRetry(_hudDisplayPath);
                if (string.IsNullOrEmpty(raw)) return;
                _lastHudDisplayWriteUtc = info.LastWriteTimeUtc;
                _lastHudDisplayLength = info.Length;

                var doc = _json.DeserializeObject(raw) as Dictionary<string, object>;
                if (doc == null) return;

                _hudDisplay = new HudDisplayConfig
                {
                    showSpeed = ReadBool(doc, "showSpeed", true),
                    showCacheHit = ReadBool(doc, "showCacheHit", true),
                    showModel = ReadBool(doc, "showModel", true),
                    showContext = ReadBool(doc, "showContext", true),
                    showQuota = ReadBool(doc, "showQuota", true)
                };
            }
            catch { }
        }

        private void SaveHudDisplayConfig(HudDisplayConfig next)
        {
            if (next == null) return;
            _hudDisplay = next.Clone();
            PushHudDisplayToWindows();
            try
            {
                long epochMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                var payload = new Dictionary<string, object>
                {
                    { "showSpeed", _hudDisplay.showSpeed },
                    { "showCacheHit", _hudDisplay.showCacheHit },
                    { "showModel", _hudDisplay.showModel },
                    { "showContext", _hudDisplay.showContext },
                    { "showQuota", _hudDisplay.showQuota },
                    { "updatedAtMs", epochMs }
                };
                string tmp = _hudDisplayPath + ".tmp";
                File.WriteAllText(tmp, _json.Serialize(payload), Encoding.UTF8);
                try
                {
                    if (File.Exists(_hudDisplayPath))
                    {
                        File.Replace(tmp, _hudDisplayPath, null);
                    }
                    else
                    {
                        File.Move(tmp, _hudDisplayPath);
                    }
                }
                catch
                {
                    File.Copy(tmp, _hudDisplayPath, true);
                    try { File.Delete(tmp); } catch { }
                }
                if (File.Exists(_hudDisplayPath))
                {
                    var info = new FileInfo(_hudDisplayPath);
                    _lastHudDisplayWriteUtc = info.LastWriteTimeUtc;
                    _lastHudDisplayLength = info.Length;
                }
            }
            catch { }
        }

        private void PushHudDisplayToWindows()
        {
            foreach (TrackedHostWindow item in _tracked.Values)
            {
                if (item.Hud != null)
                {
                    item.Hud.UpdateDisplay(_hudDisplay);
                }
            }
            if (_hudPopup != null)
            {
                TrackedHostWindow ownerItem = null;
                if (_hudPopupOwnerHwnd != IntPtr.Zero)
                {
                    _tracked.TryGetValue(_hudPopupOwnerHwnd, out ownerItem);
                }
                _hudPopup.UpdateState(_hudDisplay, ResolveTelemetryForWindow(ownerItem), _config.accentColor);
            }
        }

        private void StartPopupWatchTimer()
        {
            if (_popupWatchTimer == null)
            {
                _popupWatchTimer = new DispatcherTimer(DispatcherPriority.Background, _dispatcher);
                _popupWatchTimer.Interval = TimeSpan.FromMilliseconds(30);
                _popupWatchTimer.Tick += OnPopupWatchTick;
            }
            _popupInitialFgHwnd = Native.GetForegroundWindow();
            _popupPrevMouseDown = ((Native.GetAsyncKeyState(Native.VK_LBUTTON) | Native.GetAsyncKeyState(Native.VK_RBUTTON)) & 0x8000) != 0;
            if (!_popupWatchTimer.IsEnabled)
            {
                _popupWatchTimer.Start();
            }
        }

        private void StopPopupWatchTimer()
        {
            try
            {
                if (_popupWatchTimer != null && _popupWatchTimer.IsEnabled)
                {
                    _popupWatchTimer.Stop();
                }
            }
            catch { }
        }

        private void OnPopupWatchTick(object sender, EventArgs e)
        {
            if (_hudPopupOpening) return;
            if (_disposed || _hudPopup == null)
            {
                StopPopupWatchTimer();
                return;
            }

            if ((Native.GetAsyncKeyState(Native.VK_ESCAPE) & 0x8000) != 0)
            {
                CloseHudPopup();
                return;
            }

            IntPtr fg = Native.GetForegroundWindow();
            if (fg != IntPtr.Zero && _hudPopupOwnerHwnd != IntPtr.Zero && fg != _hudPopupOwnerHwnd && fg != _popupInitialFgHwnd)
            {
                CloseHudPopup();
                return;
            }

            bool btnDown = ((Native.GetAsyncKeyState(Native.VK_LBUTTON) & 0x8000) != 0) ||
                           ((Native.GetAsyncKeyState(Native.VK_RBUTTON) & 0x8000) != 0);
            if (btnDown && !_popupPrevMouseDown)
            {
                Native.POINT pt;
                if (Native.GetCursorPos(out pt))
                {
                    bool insidePopup = false;
                    IntPtr popH = _hudPopup.Handle;
                    if (popH != IntPtr.Zero)
                    {
                        Native.RECT pr;
                        if (Native.GetWindowRect(popH, out pr))
                        {
                            insidePopup = pt.X >= pr.Left && pt.X <= pr.Right && pt.Y >= pr.Top && pt.Y <= pr.Bottom;
                        }
                    }

                    bool insideHud = false;
                    TrackedHostWindow ownerRec;
                    if (!insidePopup && _hudPopupOwnerHwnd != IntPtr.Zero && _tracked.TryGetValue(_hudPopupOwnerHwnd, out ownerRec) && ownerRec.HudVisible)
                    {
                        insideHud = pt.X >= ownerRec.LastHudX && pt.X <= (ownerRec.LastHudX + ownerRec.LastHudW) &&
                                    pt.Y >= ownerRec.LastHudY && pt.Y <= (ownerRec.LastHudY + ownerRec.LastHudH);
                    }

                    if (!insidePopup && !insideHud)
                    {
                        CloseHudPopup();
                        return;
                    }
                }
            }
            _popupPrevMouseDown = btnDown;
        }

        private string ResolveGuideImagePath()
        {
            try
            {
                if (!string.IsNullOrEmpty(_assetsDir))
                {
                    string parentDir = System.IO.Path.GetDirectoryName(_assetsDir);
                    if (!string.IsNullOrEmpty(parentDir))
                    {
                        string parentCandidate = System.IO.Path.Combine(parentDir, "open_console_guide.jpg");
                        if (File.Exists(parentCandidate)) return parentCandidate;
                    }
                    string directCandidate = System.IO.Path.Combine(_assetsDir, "open_console_guide.jpg");
                    if (File.Exists(directCandidate)) return directCandidate;
                }
            }
            catch { }
            return "";
        }

        private void CloseHudPopup()
        {
            StopPopupWatchTimer();
            if (_hudPopup == null) return;
            HudConfigPopupWindow closing = _hudPopup;
            _hudPopup = null;
            _hudPopupOwnerHwnd = IntPtr.Zero;
            _lastHudPopupClosedUtc = DateTime.UtcNow;
            closing.HideGuidePreview();
            ForceCloseOwnedWindow(closing);
        }

        private void ToggleHudConfigPopup(IntPtr hostHwnd)
        {
            if (_disposed || _hudPopupOpening) return;
            if (_hudPopup != null)
            {
                CloseHudPopup();
                return;
            }
            if ((DateTime.UtcNow - _lastHudPopupClosedUtc).TotalMilliseconds < 240.0)
            {
                return;
            }

            TrackedHostWindow item;
            if (hostHwnd == IntPtr.Zero || !_tracked.TryGetValue(hostHwnd, out item) || !Native.IsWindow(hostHwnd))
            {
                return;
            }
            Native.RECT winRect;
            if (!Native.TryGetVisibleBounds(hostHwnd, out winRect))
            {
                return;
            }

            double dpiScale = Native.GetWindowDpiScale(hostHwnd);
            int anchorCenterX = item.HudVisible ? (item.LastHudX + item.LastHudW / 2) : (item.Anchor.RightX - (int)Math.Round(60.0 * dpiScale));
            int anchorCenterY = item.HudVisible ? (item.LastHudY + item.LastHudH / 2) : item.Anchor.CenterY;

            _hudPopupOpening = true;
            try
            {
                var popup = new HudConfigPopupWindow(hostHwnd, ResolveGuideImagePath());
                // Bind reference BEFORE Show() so re-entrant WinEvents or SweepOrphanedWindows always track it
                _hudPopup = popup;
                _hudPopupOwnerHwnd = hostHwnd;
                popup.DisplayChanged += delegate(HudDisplayConfig nextCfg)
                {
                    SaveHudDisplayConfig(nextCfg);
                };
                popup.Closed += delegate
                {
                    if (_hudPopup == popup)
                    {
                        StopPopupWatchTimer();
                        _hudPopup = null;
                        _hudPopupOwnerHwnd = IntPtr.Zero;
                        _lastHudPopupClosedUtc = DateTime.UtcNow;
                    }
                };

                popup.UpdateState(_hudDisplay, ResolveTelemetryForWindow(item), _config.accentColor);
                popup.PositionAboveHud(winRect, anchorCenterX, anchorCenterY, dpiScale);
                popup.Show();
                if (_hudPopup == popup)
                {
                    popup.PositionAboveHud(winRect, anchorCenterX, anchorCenterY, dpiScale);
                    StartPopupWatchTimer();
                }
            }
            catch (Exception ex)
            {
                LogFatalException("ToggleHudConfigPopup", ex);
                CloseHudPopup();
            }
            finally
            {
                _hudPopupOpening = false;
            }
        }

        private void ReloadHudTelemetry()
        {
            try
            {
                if (!File.Exists(_hudTelemetryPath)) return;
                var info = new FileInfo(_hudTelemetryPath);
                string raw = ReadTextWithRetry(_hudTelemetryPath);
                if (string.IsNullOrEmpty(raw)) return;
                _lastHudWriteUtc = info.LastWriteTimeUtc;
                _lastHudLength = info.Length;

                var doc = _json.DeserializeObject(raw) as Dictionary<string, object>;
                if (doc == null) return;

                var next = new HudTelemetry
                {
                    percent = ClampInt(ReadInt(doc, "percent", 0), 0, 999),
                    totalUsed = ReadLong(doc, "totalUsed", 0),
                    windowCap = ReadLong(doc, "windowCap", 512000),
                    tokPerSec = ReadNullableDouble(doc, "tokPerSec"),
                    cacheHitPct = ReadNullableInt(doc, "cacheHitPct"),
                    upstreamModelId = ReadString(doc, "upstreamModelId", ""),
                    upstreamModelStatus = ReadString(doc, "upstreamModelStatus", "no_baseline"),
                    cdpHudActive = ReadBool(doc, "cdpHudActive", false)
                };
                object rawSessionsObj;
                if (doc.TryGetValue("sessions", out rawSessionsObj) && rawSessionsObj is System.Collections.IEnumerable && !(rawSessionsObj is string))
                {
                    foreach (object entryObj in (System.Collections.IEnumerable)rawSessionsObj)
                    {
                        var sdoc = entryObj as Dictionary<string, object>;
                        if (sdoc == null) continue;
                        next.sessions.Add(new HudSessionEntry
                        {
                            id = ReadString(sdoc, "id", ""),
                            title = ReadString(sdoc, "title", "").Trim(),
                            workspace = ReadString(sdoc, "workspace", "").Trim(),
                            percent = ClampInt(ReadInt(sdoc, "percent", 0), 0, 999),
                            totalUsed = ReadLong(sdoc, "totalUsed", 0),
                            windowCap = ReadLong(sdoc, "windowCap", next.windowCap),
                            tokPerSec = ReadNullableDouble(sdoc, "tokPerSec"),
                            cacheHitPct = ReadNullableInt(sdoc, "cacheHitPct"),
                            upstreamModelId = ReadString(sdoc, "upstreamModelId", "")
                        });
                    }
                }
                string nextActiveConvId = ReadString(doc, "activeConvId", "");
                if (!string.Equals(nextActiveConvId, _lastHudActiveConvId, StringComparison.Ordinal))
                {
                    _lastHudActiveConvId = nextActiveConvId;
                    _lastHudActiveConvChangedUtc = DateTime.UtcNow;
                    if (_tracked.Count <= 1)
                    {
                        foreach (TrackedHostWindow item in _tracked.Values)
                        {
                            if (item.WindowViewUpdatedUtc < _lastHudActiveConvChangedUtc)
                            {
                                item.WindowTitle = "";
                                item.WindowWorkspace = "";
                                item.WindowIsNewConv = false;
                            }
                        }
                    }
                }
                bool cdpChanged = _hudTelemetry == null || _hudTelemetry.cdpHudActive != next.cdpHudActive;
                _hudTelemetry = next;
                if (cdpChanged)
                {
                    SyncAllWindows(false);
                }
            }
            catch { }
        }

        private bool MatchesAnyKnownSession(string winTitle, string winWs)
        {
            if (string.IsNullOrEmpty(winTitle)) return false;
            if (_hudTelemetry == null || _hudTelemetry.sessions == null || _hudTelemetry.sessions.Count == 0)
            {
                return !string.IsNullOrEmpty(winWs);
            }
            string t = winTitle.Trim();
            bool ellipsized = t.EndsWith("...") || t.EndsWith("…");
            string stripped = t.TrimEnd('.', '…').Trim();
            for (int i = 0; i < _hudTelemetry.sessions.Count; i++)
            {
                HudSessionEntry s = _hudTelemetry.sessions[i];
                if (s == null || string.IsNullOrEmpty(s.title)) continue;
                if (string.Equals(s.title, t, StringComparison.OrdinalIgnoreCase)) return true;
                if (stripped.Length >= 4 &&
                    (s.title.StartsWith(stripped, StringComparison.OrdinalIgnoreCase) ||
                     (ellipsized && stripped.StartsWith(s.title, StringComparison.OrdinalIgnoreCase))))
                {
                    return true;
                }
            }
            return false;
        }

        private HudTelemetry ResolveTelemetryForWindow(TrackedHostWindow item)
        {
            if (item == null) return _hudTelemetry;
            if (item.WindowIsNewConv)
            {
                return new HudTelemetry
                {
                    percent = 0,
                    totalUsed = 0,
                    windowCap = _hudTelemetry != null ? _hudTelemetry.windowCap : 512000,
                    tokPerSec = null,
                    cacheHitPct = null,
                    upstreamModelId = "",
                    upstreamModelStatus = "unreported",
                    cdpHudActive = _hudTelemetry != null && _hudTelemetry.cdpHudActive
                };
            }
            if (_hudTelemetry != null && _hudTelemetry.sessions != null && _hudTelemetry.sessions.Count > 0 && !string.IsNullOrEmpty(item.WindowTitle))
            {
                string winTitle = item.WindowTitle.Trim();
                string winWs = (item.WindowWorkspace ?? "").Trim();
                bool ellipsized = winTitle.EndsWith("...") || winTitle.EndsWith("…");
                string stripped = winTitle.TrimEnd('.', '…').Trim();
                HudSessionEntry best = null;
                int bestScore = 0;

                for (int i = 0; i < _hudTelemetry.sessions.Count; i++)
                {
                    HudSessionEntry s = _hudTelemetry.sessions[i];
                    if (s == null || string.IsNullOrEmpty(s.title)) continue;
                    int score = 0;
                    if (string.Equals(s.title, winTitle, StringComparison.OrdinalIgnoreCase))
                    {
                        score = 100;
                    }
                    else if (stripped.Length >= 4 &&
                        (s.title.StartsWith(stripped, StringComparison.OrdinalIgnoreCase) ||
                         (ellipsized && stripped.StartsWith(s.title, StringComparison.OrdinalIgnoreCase))))
                    {
                        score = 60;
                    }
                    if (score <= 0) continue;
                    if (!string.IsNullOrEmpty(winWs) && !string.IsNullOrEmpty(s.workspace) &&
                        (string.Equals(s.workspace, winWs, StringComparison.OrdinalIgnoreCase) ||
                         s.workspace.StartsWith(winWs, StringComparison.OrdinalIgnoreCase) ||
                         winWs.StartsWith(s.workspace, StringComparison.OrdinalIgnoreCase)))
                    {
                        score += 20;
                    }
                    if (score > bestScore)
                    {
                        bestScore = score;
                        best = s;
                    }
                }

                if (best != null)
                {
                    return new HudTelemetry
                    {
                        percent = best.percent,
                        totalUsed = best.totalUsed,
                        windowCap = best.windowCap,
                        tokPerSec = best.tokPerSec,
                        cacheHitPct = best.cacheHitPct,
                        upstreamModelId = best.upstreamModelId ?? "",
                        upstreamModelStatus = _hudTelemetry.upstreamModelStatus,
                        cdpHudActive = _hudTelemetry.cdpHudActive
                    };
                }
            }
            return _hudTelemetry;
        }

        private void PushHudTelemetryToWindows()
        {
            foreach (TrackedHostWindow item in _tracked.Values)
            {
                if (item.Hud != null)
                {
                    item.Hud.UpdateData(ResolveTelemetryForWindow(item), _config.accentColor);
                }
            }
            if (_hudPopup != null)
            {
                TrackedHostWindow ownerItem = null;
                if (_hudPopupOwnerHwnd != IntPtr.Zero)
                {
                    _tracked.TryGetValue(_hudPopupOwnerHwnd, out ownerItem);
                }
                _hudPopup.UpdateState(_hudDisplay, ResolveTelemetryForWindow(ownerItem), _config.accentColor);
            }
        }

        private void ReloadThemeConfig(bool forceImageReload)
        {
            try
            {
                if (!File.Exists(_themesPath)) return;
                var info = new FileInfo(_themesPath);
                string raw = ReadTextWithRetry(_themesPath);
                if (string.IsNullOrEmpty(raw)) return;
                _lastThemesWriteUtc = info.LastWriteTimeUtc;
                _lastThemesLength = info.Length;
                var doc = _json.DeserializeObject(raw) as Dictionary<string, object>;
                if (doc == null) return;

                var next = new ThemeConfig
                {
                    backdropEnabled = ReadBool(doc, "backdropEnabled", true),
                    hudEnabled = ReadBool(doc, "hudEnabled", true),
                    hostThemeMode = ReadString(doc, "hostThemeMode", "inject"),
                    hostBlendPct = ClampInt(ReadInt(doc, "hostBlendPct", 18), 5, 42),
                    activeWallpaperId = ReadString(doc, "activeWallpaperId", ""),
                    opacity = ClampInt(ReadInt(doc, "opacity", 32), 0, 100),
                    blur = ClampInt(ReadInt(doc, "blur", 4), 0, 24),
                    dim = ClampInt(ReadInt(doc, "dim", 52), 0, 85),
                    radius = ClampInt(ReadInt(doc, "radius", 12), 4, 18),
                    fit = ReadString(doc, "fit", "cover"),
                    canvasColor = "#070709",
                    accentColor = "#5B8CFF",
                    zeroUiaMode = ReadBool(doc, "zeroUiaMode", false)
                };

                var colors = doc.ContainsKey("colors") ? doc["colors"] as Dictionary<string, object> : null;
                if (colors != null)
                {
                    next.canvasColor = ReadString(colors, "canvas", "#070709");
                    next.accentColor = ReadString(colors, "accent", "#5B8CFF");
                }

                next.wallpaperPath = ResolveWallpaperPath(next.activeWallpaperId, doc);
                _config = next;
                _hudEnabledByTray = next.hudEnabled;
                if (_hudMenuItem != null)
                {
                    _hudMenuItem.Checked = next.hudEnabled;
                }
                _configVersion++;
                foreach (TrackedHostWindow tItem in _tracked.Values)
                {
                    tItem.BackdropGuardBlocked = false;
                    tItem.BackdropZFailCount = 0;
                    tItem.BackdropBlockReason = "";
                }

                if (!IsBackdropEffectWanted())
                {
                    ReleaseSharedWallpaperBitmaps();
                }
                else if (forceImageReload || _cachedBitmap == null || !string.Equals(_cachedWpPath, _config.wallpaperPath ?? "", StringComparison.OrdinalIgnoreCase))
                {
                    LoadSharedWallpaperBitmap(_config.wallpaperPath);
                }
                else if (!string.IsNullOrEmpty(_config.wallpaperPath) && File.Exists(_config.wallpaperPath))
                {
                    DateTime wpTime = File.GetLastWriteTimeUtc(_config.wallpaperPath);
                    if (wpTime != _cachedWpMtimeUtc)
                    {
                        LoadSharedWallpaperBitmap(_config.wallpaperPath);
                    }
                }

                BitmapSource effectiveWallpaper = IsBackdropEffectWanted() ? GetEffectiveWallpaperBitmap() : null;
                foreach (TrackedHostWindow item in _tracked.Values)
                {
                    if (item.Backdrop != null)
                    {
                        if (effectiveWallpaper == null)
                        {
                            RestoreBackdropOnly(item, false);
                        }
                        else
                        {
                            item.AppliedConfigVersion = _configVersion;
                            item.Backdrop.ApplyVisuals(_config, effectiveWallpaper, item.LastMaximized);
                        }
                    }
                    if (item.Hud != null)
                    {
                        item.Hud.UpdateData(ResolveTelemetryForWindow(item), _config.accentColor);
                    }
                }
            }
            catch { }
        }

        private void PersistHudEnabledToThemesFile(bool enabled)
        {
            try
            {
                if (string.IsNullOrEmpty(_themesPath) || !File.Exists(_themesPath)) return;
                string raw = ReadTextWithRetry(_themesPath);
                if (string.IsNullOrEmpty(raw)) return;
                var doc = _json.DeserializeObject(raw) as Dictionary<string, object>;
                if (doc == null) return;
                doc["hudEnabled"] = enabled;
                var localJson = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
                string tmp = _themesPath + ".tmp." + _selfPid.ToString(CultureInfo.InvariantCulture);
                File.WriteAllText(tmp, localJson.Serialize(doc), new UTF8Encoding(false));
                try
                {
                    File.Replace(tmp, _themesPath, null);
                }
                catch
                {
                    File.Copy(tmp, _themesPath, true);
                    try { File.Delete(tmp); } catch { }
                }
                var info = new FileInfo(_themesPath);
                _lastThemesWriteUtc = info.LastWriteTimeUtc;
                _lastThemesLength = info.Length;
            }
            catch { }
        }

        private string ResolveWallpaperPath(string activeWpId, Dictionary<string, object> doc)
        {
            if (string.IsNullOrEmpty(activeWpId)) return "";
            if (activeWpId.StartsWith("wp-", StringComparison.OrdinalIgnoreCase))
            {
                string builtinFile = System.IO.Path.Combine(_assetsDir, System.IO.Path.GetFileName(activeWpId) + ".webp");
                return File.Exists(builtinFile) ? builtinFile : "";
            }
            object rawCustomObj;
            if (doc.TryGetValue("customWallpapers", out rawCustomObj) && rawCustomObj is System.Collections.IEnumerable && !(rawCustomObj is string))
            {
                string wpDir = System.IO.Path.Combine(_dataDir, "wallpapers");
                foreach (object entryObj in (System.Collections.IEnumerable)rawCustomObj)
                {
                    var entry = entryObj as Dictionary<string, object>;
                    if (entry == null) continue;
                    string id = ReadString(entry, "id", "");
                    if (string.Equals(id, activeWpId, StringComparison.Ordinal))
                    {
                        string fname = System.IO.Path.GetFileName(ReadString(entry, "filename", ""));
                        if (!string.IsNullOrEmpty(fname))
                        {
                            string full = System.IO.Path.Combine(wpDir, fname);
                            if (File.Exists(full)) return full;
                        }
                    }
                }
            }
            return "";
        }

        private bool IsBackdropEffectWanted()
        {
            bool isCssMode = string.Equals(_config.hostThemeMode, "cdp", StringComparison.OrdinalIgnoreCase)
                || string.Equals(_config.hostThemeMode, "inject", StringComparison.OrdinalIgnoreCase);
            return _config.backdropEnabled && !_pausedByTray && !isCssMode && !string.IsNullOrEmpty(_config.wallpaperPath);
        }

        private void ReleaseSharedWallpaperBitmaps()
        {
            bool hadAny = _cachedBitmap != null || _cachedBlurredBitmap != null;
            _cachedBitmap = null;
            _cachedBlurredBitmap = null;
            _cachedBlurredRadius = 0;
            _cachedBlurredWpPath = "";
            _cachedBlurredWpMtimeUtc = DateTime.MinValue;
            _cachedWpPath = "";
            _cachedWpMtimeUtc = DateTime.MinValue;
            if (hadAny)
            {
                Native.TrimWorkingSet();
            }
        }

        private BitmapSource GetEffectiveWallpaperBitmap()
        {
            if (_cachedBitmap == null) return null;
            int blur = Math.Max(0, Math.Min(24, _config.blur));
            if (blur <= 0)
            {
                _cachedBlurredBitmap = null;
                _cachedBlurredRadius = 0;
                _cachedBlurredWpPath = "";
                _cachedBlurredWpMtimeUtc = DateTime.MinValue;
                return _cachedBitmap;
            }
            if (_cachedBlurredBitmap != null &&
                _cachedBlurredRadius == blur &&
                string.Equals(_cachedBlurredWpPath, _cachedWpPath, StringComparison.OrdinalIgnoreCase) &&
                _cachedBlurredWpMtimeUtc == _cachedWpMtimeUtc)
            {
                return _cachedBlurredBitmap;
            }
            _cachedBlurredBitmap = BitmapUtil.CreatePreBlurredBitmap(_cachedBitmap, blur);
            _cachedBlurredRadius = blur;
            _cachedBlurredWpPath = _cachedWpPath;
            _cachedBlurredWpMtimeUtc = _cachedWpMtimeUtc;
            return _cachedBlurredBitmap ?? _cachedBitmap;
        }

        private void LoadSharedWallpaperBitmap(string filePath)
        {
            _cachedWpPath = filePath ?? "";
            _cachedBitmap = null;
            _cachedBlurredBitmap = null;
            _cachedBlurredRadius = 0;
            _cachedBlurredWpPath = "";
            _cachedBlurredWpMtimeUtc = DateTime.MinValue;
            _cachedWpMtimeUtc = DateTime.MinValue;
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                Native.TrimWorkingSet();
                return;
            }

            try
            {
                _cachedWpMtimeUtc = File.GetLastWriteTimeUtc(filePath);
                int maxMonitorWidth = Native.GetMaxMonitorPhysicalWidth();
                int srcWidth;
                int srcHeight;
                bool probed = BitmapUtil.TryProbeImageDimensions(filePath, out srcWidth, out srcHeight);
                int targetDecodeWidth = probed ? Math.Min(srcWidth, maxMonitorWidth) : maxMonitorWidth;
                using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    var bmp = new BitmapImage();
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
                    if (!probed || srcWidth > maxMonitorWidth)
                    {
                        bmp.DecodePixelWidth = targetDecodeWidth;
                    }
                    bmp.StreamSource = fs;
                    bmp.EndInit();
                    bmp.Freeze();
                    _cachedBitmap = bmp;
                }
                Native.TrimWorkingSet();
            }
            catch
            {
                _cachedBitmap = null;
                _cachedBlurredBitmap = null;
            }
        }

        private static void ForceCloseOwnedWindow(Window win)
        {
            if (win == null) return;
            try
            {
                IntPtr h = new WindowInteropHelper(win).Handle;
                if (h != IntPtr.Zero && Native.IsWindow(h))
                {
                    Native.ShowWindow(h, Native.SW_HIDE);
                    Native.SetWindowLongPtrCompat(h, Native.GWLP_HWNDPARENT, 0);
                }
            }
            catch { }
            try { win.Hide(); } catch { }
            try { win.Close(); } catch { }
        }

        private static void HideHudIfVisible(TrackedHostWindow item)
        {
            if (item == null || item.Hud == null) return;
            try
            {
                IntPtr h = item.Hud.Handle;
                if (h != IntPtr.Zero && (item.HudVisible || Native.IsWindowVisible(h)))
                {
                    Native.ShowWindow(h, Native.SW_HIDE);
                }
            }
            catch { }
            item.HudVisible = false;
        }

        private void SweepOrphanedWindows()
        {
            try
            {
                System.Windows.Application app = System.Windows.Application.Current;
                if (app == null) return;

                var active = new HashSet<Window>();
                foreach (TrackedHostWindow item in _tracked.Values)
                {
                    if (item.Hud != null) active.Add(item.Hud);
                    if (item.Backdrop != null) active.Add(item.Backdrop);
                }
                if (_lightbox != null) active.Add(_lightbox);
                if (_hudPopup != null)
                {
                    active.Add(_hudPopup);
                    if (_hudPopup.GuideWindow != null) active.Add(_hudPopup.GuideWindow);
                }

                var orphans = new List<Window>();
                foreach (Window w in app.Windows)
                {
                    if ((w is HudOverlayWindow || w is BackdropSurfaceWindow || w is ImageLightboxWindow || w is HudConfigPopupWindow || w is HudGuidePreviewWindow) && !active.Contains(w))
                    {
                        orphans.Add(w);
                    }
                }

                foreach (Window orphan in orphans)
                {
                    ForceCloseOwnedWindow(orphan);
                }
            }
            catch { }
        }

        private static void CommitPendingMoves(List<PendingWinMove> batch)
        {
            if (batch == null || batch.Count == 0) return;
            if (batch.Count == 1)
            {
                PendingWinMove m = batch[0];
                Native.SetWindowPos(m.Hwnd, m.InsertAfter, m.X, m.Y, m.W, m.H, m.Flags);
                return;
            }
            IntPtr hdwp = Native.BeginDeferWindowPos(batch.Count);
            if (hdwp != IntPtr.Zero)
            {
                for (int i = 0; i < batch.Count; i++)
                {
                    PendingWinMove m = batch[i];
                    hdwp = Native.DeferWindowPos(hdwp, m.Hwnd, m.InsertAfter, m.X, m.Y, m.W, m.H, m.Flags);
                    if (hdwp == IntPtr.Zero) break;
                }
                if (hdwp != IntPtr.Zero && Native.EndDeferWindowPos(hdwp))
                {
                    return;
                }
            }
            // Fallback to individual SetWindowPos if BeginDeferWindowPos fails
            for (int i = 0; i < batch.Count; i++)
            {
                PendingWinMove m = batch[i];
                Native.SetWindowPos(m.Hwnd, m.InsertAfter, m.X, m.Y, m.W, m.H, m.Flags);
            }
        }

        private void SyncHudForWindow(TrackedHostWindow item, Native.RECT winRect)
        {
            SyncHudForWindow(item, winRect, null);
        }

        private void SyncHudForWindow(TrackedHostWindow item, Native.RECT winRect, List<PendingWinMove> batch)
        {
            if (item == null || !Native.IsWindow(item.Hwnd)) return;

            bool lightboxOpen = _lightbox != null && _lightbox.IsVisible;
            bool wantHud = _config.hudEnabled && _hudEnabledByTray && !_pausedByTray && !_hudTelemetry.cdpHudActive && !lightboxOpen;
            bool hostVisible = Native.IsWindowVisible(item.Hwnd) && !Native.IsIconic(item.Hwnd) && !Native.IsWindowCloaked(item.Hwnd);
            bool validBounds = (winRect.Right - winRect.Left) >= 300 && (winRect.Bottom - winRect.Top) >= 240;
            double hostDpiScale = Native.GetWindowDpiScale(item.Hwnd);
            bool consoleCoversAnchor = item.Anchor.HasAnchor && IsConsoleCoveringAnchor(item, winRect, hostDpiScale);
            item.ConsoleOccluded = consoleCoversAnchor;

            // Only show WPF HUD when anchored to a real composer toolbar AND not occluded by native popups or full-screen AGY Console
            bool showHud = wantHud && hostVisible && validBounds && item.Anchor.HasAnchor && item.Anchor.ComposerVisible && !item.Anchor.Occluded && !consoleCoversAnchor;

            if (!showHud)
            {
                HideHudIfVisible(item);
                return;
            }

            if (item.Hud == null)
            {
                IntPtr targetHwnd = item.Hwnd;
                var hud = new HudOverlayWindow(targetHwnd);
                // Bind reference BEFORE Show() so re-entrant WinEvents can never spawn a second orphaned HUD
                item.Hud = hud;
                hud.Clicked += delegate
                {
                    try { ToggleHudConfigPopup(targetHwnd); }
                    catch (Exception ex)
                    {
                        LogFatalException("HudClicked", ex);
                        CloseHudPopup();
                    }
                };
                hud.UpdateDisplay(_hudDisplay);
                hud.UpdateData(ResolveTelemetryForWindow(item), _config.accentColor);
                hud.Show();
            }

            IntPtr hudHwnd = item.Hud.Handle;
            if (hudHwnd == IntPtr.Zero) return;

            if (Math.Abs(hostDpiScale - item.LastHostDpiScale) > 0.01)
            {
                item.LastHostDpiScale = hostDpiScale;
                TriggerFastUiaBurst(750, false);
            }

            int physW, physH;
            bool scaleChanged = item.Hud.ApplyDpiScale(hostDpiScale, out physW, out physH);

            int anchorW = Math.Max(1, item.Anchor.AnchorWinRight - item.Anchor.AnchorWinLeft);
            int curW = Math.Max(1, winRect.Right - winRect.Left);
            int relBottom = item.Anchor.AnchorWinBottom - item.Anchor.CenterY;
            int centerY = winRect.Bottom - relBottom;
            int rightX;
            int leftGuardX;

            if (curW == anchorW)
            {
                int dx = winRect.Left - item.Anchor.AnchorWinLeft;
                rightX = item.Anchor.RightX + dx;
                leftGuardX = item.Anchor.LeftGuardX + dx;
            }
            else
            {
                // Proportional projection avoids slamming HUD into the right side panel while 60fps UIA refines exact anchor
                double relLeftFrac = Math.Max(0.05, Math.Min(0.95, (item.Anchor.LeftGuardX - item.Anchor.AnchorWinLeft) / (double)anchorW));
                double relRightFrac = Math.Max(0.05, Math.Min(0.98, (item.Anchor.RightX - item.Anchor.AnchorWinLeft) / (double)anchorW));
                leftGuardX = winRect.Left + (int)Math.Round(curW * relLeftFrac);
                rightX = winRect.Left + (int)Math.Round(curW * relRightFrac);
                TriggerFastUiaBurst(750, false);
            }

            int minRightX = winRect.Left + (int)Math.Round(48 * hostDpiScale);
            int maxRightX = winRect.Right - (int)Math.Round(8 * hostDpiScale);
            if (rightX < minRightX) rightX = minRightX;
            if (rightX > maxRightX) rightX = maxRightX;

            // Never push HUD leftward over model picker / composer edge; progressively drop model -> cache -> speed -> ring-only -> hide
            int availPhysW = rightX - leftGuardX;
            if (availPhysW < (int)Math.Round(21 * hostDpiScale))
            {
                HideHudIfVisible(item);
                return;
            }
            item.Hud.SetAvailableDipWidth(availPhysW / Math.Max(0.5, hostDpiScale));

            int x = rightX - physW;
            int maxX = winRect.Right - physW - (int)Math.Round(8 * hostDpiScale);
            if (x > maxX) x = maxX;

            int y = centerY - (physH / 2);
            int minY = winRect.Top + (int)Math.Round(60 * hostDpiScale);
            int maxY = Math.Max(minY, winRect.Bottom - physH - (int)Math.Round(6 * hostDpiScale));
            if (y < minY) y = minY;
            if (y > maxY) y = maxY;

            bool moved = scaleChanged || !item.HudVisible || x != item.LastHudX || y != item.LastHudY || physW != item.LastHudW || physH != item.LastHudH;
            if (moved)
            {
                uint flags = Native.SWP_NOACTIVATE | Native.SWP_NOZORDER | Native.SWP_SHOWWINDOW;
                if (batch != null)
                {
                    batch.Add(new PendingWinMove
                    {
                        Hwnd = hudHwnd,
                        InsertAfter = IntPtr.Zero,
                        X = x,
                        Y = y,
                        W = physW,
                        H = physH,
                        Flags = flags
                    });
                }
                else
                {
                    Native.SetWindowPos(hudHwnd, IntPtr.Zero, x, y, physW, physH, flags);
                }
                item.HudVisible = true;
                item.LastHudX = x;
                item.LastHudY = y;
                item.LastHudW = physW;
                item.LastHudH = physH;
            }
        }

        private void SyncAllWindows(bool refreshInventory)
        {
            if (_disposed) return;
            if (_inSync)
            {
                _syncPending = true;
                return;
            }

            _inSync = true;
            try
            {
                if (refreshInventory)
                {
                    List<IntPtr> currentTargets = FindAntigravityTopWindows();
                    var liveSet = new HashSet<IntPtr>(currentTargets);

                    var stale = new List<IntPtr>();
                    foreach (IntPtr existing in _tracked.Keys)
                    {
                        if (!liveSet.Contains(existing) || !Native.IsWindow(existing))
                        {
                            stale.Add(existing);
                        }
                    }
                    foreach (IntPtr h in stale)
                    {
                        RestoreHostWindow(_tracked[h], true);
                        _tracked.Remove(h);
                    }

                    foreach (IntPtr h in currentTargets)
                    {
                        if (!_tracked.ContainsKey(h))
                        {
                            long origEx = Native.GetWindowLongPtrCompat(h, Native.GWL_EXSTYLE);
                            byte residualAlpha;
                            bool hasResidualAlpha = Native.IsWindowTranslucentLayered(h, out residualAlpha);
                            var rec = new TrackedHostWindow
                            {
                                Hwnd = h,
                                OriginalExStyle = hasResidualAlpha ? (origEx & ~Native.WS_EX_LAYERED) : origEx,
                                OriginallyLayered = ((origEx & Native.WS_EX_LAYERED) != 0) && !hasResidualAlpha,
                                AlphaApplied = hasResidualAlpha,
                                LastAlpha = hasResidualAlpha ? residualAlpha : (byte)255
                            };
                            _tracked[h] = rec;
                        }
                    }

                    SweepOrphanedWindows();
                    SyncHostPidHooks();
                }

                bool wantBackdrop = IsBackdropEffectWanted();
                if (wantBackdrop && _cachedBitmap == null)
                {
                    LoadSharedWallpaperBitmap(_config.wallpaperPath);
                }
                BitmapSource effectiveWallpaper = wantBackdrop ? GetEffectiveWallpaperBitmap() : null;
                bool activeEffect = wantBackdrop && effectiveWallpaper != null;
                byte targetAlpha = activeEffect
                    ? (byte)Math.Max(148, Math.Min(254, Math.Round(255.0 * (100 - _config.hostBlendPct) / 100.0)))
                    : (byte)255;

                var backdropMoves = new List<PendingWinMove>(Math.Max(1, _tracked.Count));
                var hudMoves = new List<PendingWinMove>(Math.Max(1, _tracked.Count));
                var alphaTargets = new List<TrackedHostWindow>(Math.Max(1, _tracked.Count));

                foreach (TrackedHostWindow item in _tracked.Values)
                {
                    if (!Native.IsWindow(item.Hwnd))
                    {
                        HideHudIfVisible(item);
                        if (item.Backdrop != null && item.BackdropVisible && item.Backdrop.Handle != IntPtr.Zero)
                        {
                            Native.ShowWindow(item.Backdrop.Handle, Native.SW_HIDE);
                            item.BackdropVisible = false;
                        }
                        continue;
                    }

                    Native.RECT r;
                    bool hasBounds = Native.TryGetVisibleBounds(item.Hwnd, out r);
                    if (hasBounds)
                    {
                        try { SyncHudForWindow(item, r, hudMoves); } catch { }
                    }
                    else
                    {
                        HideHudIfVisible(item);
                    }

                    if (!activeEffect || item.BackdropGuardBlocked)
                    {
                        RestoreBackdropOnly(item, false);
                        continue;
                    }

                    bool isHostVisible = Native.IsWindowVisible(item.Hwnd);
                    bool isHostIconic = Native.IsIconic(item.Hwnd);
                    bool isHostCloaked = Native.IsWindowCloaked(item.Hwnd);
                    bool visible = isHostVisible && !isHostIconic && !isHostCloaked;
                    if (!visible)
                    {
                        if (item.Backdrop != null && item.BackdropVisible && item.Backdrop.Handle != IntPtr.Zero)
                        {
                            Native.ShowWindow(item.Backdrop.Handle, Native.SW_HIDE);
                            item.BackdropVisible = false;
                            _backdropHideCount++;
                            _backdropLastHideReason = isHostIconic ? "host-iconic" : (isHostCloaked ? "host-cloaked" : "host-invisible");
                        }
                        continue;
                    }

                    bool isMaximized = Native.IsZoomed(item.Hwnd);
                    if (item.Backdrop == null)
                    {
                        var backdrop = new BackdropSurfaceWindow();
                        item.Backdrop = backdrop;
                        backdrop.Show();
                        // Immediately hide off-screen HWND until strictly verified behind item.Hwnd (never flash above host!)
                        if (backdrop.Handle != IntPtr.Zero)
                        {
                            Native.ShowWindow(backdrop.Handle, Native.SW_HIDE);
                        }
                        item.BackdropVisible = false;
                        item.LastMaximized = isMaximized;
                        item.AppliedConfigVersion = _configVersion;
                        backdrop.ApplyVisuals(_config, effectiveWallpaper, isMaximized);
                    }
                    else if (item.LastMaximized != isMaximized || item.AppliedConfigVersion != _configVersion)
                    {
                        item.LastMaximized = isMaximized;
                        item.AppliedConfigVersion = _configVersion;
                        item.Backdrop.ApplyVisuals(_config, effectiveWallpaper, isMaximized);
                    }

                    IntPtr wpHwnd = item.Backdrop.Handle;
                    if (wpHwnd == IntPtr.Zero || !hasBounds) continue;

                    // Emergency guard: ONLY hide immediately if wpHwnd actually jumped ABOVE item.Hwnd!
                    // (Do not blink-hide merely because >64 windows exist below host; let Phase 1 SetWindowPos pull it back smoothly!)
                    if (item.BackdropVisible && !Native.IsWindowStrictlyBehind(wpHwnd, item.Hwnd))
                    {
                        // Check if wpHwnd is truly ABOVE hostHwnd before hiding
                        bool isAboveHost = false;
                        IntPtr upCur = Native.GetWindow(item.Hwnd, Native.GW_HWNDPREV);
                        int upChk = 0;
                        while (upCur != IntPtr.Zero && upChk < 512)
                        {
                            if (upCur == wpHwnd) { isAboveHost = true; break; }
                            upCur = Native.GetWindow(upCur, Native.GW_HWNDPREV);
                            upChk++;
                        }
                        if (isAboveHost)
                        {
                            Native.ShowWindow(wpHwnd, Native.SW_HIDE);
                            item.BackdropVisible = false;
                            _backdropHideCount++;
                            _backdropLastHideReason = "emergency-above-host";
                        }
                    }

                    int w = Math.Max(1, r.Right - r.Left);
                    int h = Math.Max(1, r.Bottom - r.Top);
                    double hostDpi = Native.GetWindowDpiScale(item.Hwnd);
                    item.Backdrop.ApplyNativeRoundedCorners(w, h, hostDpi, isMaximized, _config.radius);

                    string zBlocker = "";
                    bool zMismatch = !Native.IsDirectlyBehindVisible(wpHwnd, item.Hwnd, r, out zBlocker);
                    bool rectChanged = !item.BackdropVisible || r.Left != item.LastLeft || r.Top != item.LastTop || w != item.LastWidth || h != item.LastHeight;

                    if (zMismatch || rectChanged)
                    {
                        if (zMismatch && item.BackdropVisible)
                        {
                            _backdropZFixCount++;
                            if (!string.IsNullOrEmpty(zBlocker)) _backdropZBlockerClass = zBlocker;
                        }
                        // Phase 1: position behind host WITHOUT SWP_SHOWWINDOW first when newly showing or Z-mismatched
                        uint flags = Native.SWP_NOACTIVATE | (item.BackdropVisible && !zMismatch ? Native.SWP_SHOWWINDOW : 0u);
                        if (!rectChanged && item.BackdropVisible)
                        {
                            // Pure Z-order adjust: skip move/resize notifications to prevent WPF/DWM surface repaint flicker
                            flags |= Native.SWP_NOMOVE | Native.SWP_NOSIZE;
                        }
                        backdropMoves.Add(new PendingWinMove
                        {
                            Hwnd = wpHwnd,
                            InsertAfter = item.Hwnd,
                            X = r.Left,
                            Y = r.Top,
                            W = w,
                            H = h,
                            Flags = flags
                        });
                        item.LastLeft = r.Left;
                        item.LastTop = r.Top;
                        item.LastWidth = w;
                        item.LastHeight = h;
                    }

                    byte realAlpha;
                    bool realTranslucent = Native.IsWindowTranslucentLayered(item.Hwnd, out realAlpha);
                    if (!item.AlphaApplied || item.LastAlpha != targetAlpha || !realTranslucent || realAlpha != targetAlpha)
                    {
                        alphaTargets.Add(item);
                    }
                }

                if (!wantBackdrop && (_cachedBitmap != null || _cachedBlurredBitmap != null))
                {
                    ReleaseSharedWallpaperBitmaps();
                }

                // Phase 1: Place backdrops behind their hosts BEFORE revealing or applying host translucency
                CommitPendingMoves(backdropMoves);

                // Phase 2: IRONCLAD Z-ORDER INVARIANT — verify every backdrop is STRICTLY behind its host before showing!
                foreach (TrackedHostWindow item in _tracked.Values)
                {
                    if (!activeEffect || item.BackdropGuardBlocked || item.Backdrop == null) continue;
                    IntPtr wpHwnd = item.Backdrop.Handle;
                    if (wpHwnd == IntPtr.Zero || !Native.IsWindow(item.Hwnd)) continue;
                    bool visible = Native.IsWindowVisible(item.Hwnd) && !Native.IsIconic(item.Hwnd) && !Native.IsWindowCloaked(item.Hwnd);
                    if (!visible) continue;

                    bool behind = Native.IsWindowStrictlyBehind(wpHwnd, item.Hwnd);
                    if (!behind)
                    {
                        // One direct retry without DeferWindowPos (handles cross-monitor / Wallpaper Engine Z-band races)
                        Native.SetWindowPos(wpHwnd, item.Hwnd, item.LastLeft, item.LastTop, item.LastWidth, item.LastHeight, Native.SWP_NOACTIVATE);
                        behind = Native.IsWindowStrictlyBehind(wpHwnd, item.Hwnd);
                    }

                    if (!behind)
                    {
                        // NEVER allow an opaque backdrop window to sit above Antigravity!
                        Native.ShowWindow(wpHwnd, Native.SW_HIDE);
                        item.BackdropVisible = false;
                        _backdropHideCount++;
                        _backdropLastHideReason = "phase2-not-behind";
                        RestoreHostAlphaOnly(item);
                        item.BackdropZFailCount++;
                        if (item.BackdropZFailCount >= 3)
                        {
                            item.BackdropGuardBlocked = true;
                            item.BackdropBlockReason = "zorder-guard";
                        }
                        continue;
                    }

                    item.BackdropZFailCount = 0;
                    if (!item.BackdropVisible || !Native.IsWindowVisible(wpHwnd))
                    {
                        Native.SetWindowPos(wpHwnd, IntPtr.Zero, item.LastLeft, item.LastTop, item.LastWidth, item.LastHeight,
                            Native.SWP_NOZORDER | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
                        item.BackdropVisible = true;
                    }
                }

                for (int i = 0; i < alphaTargets.Count; i++)
                {
                    TrackedHostWindow item = alphaTargets[i];
                    if (!Native.IsWindow(item.Hwnd)) continue;
                    if (item.BackdropGuardBlocked || !item.BackdropVisible) continue;
                    if (item.Backdrop == null || !Native.IsWindowStrictlyBehind(item.Backdrop.Handle, item.Hwnd)) continue;

                    long curEx = Native.GetWindowLongPtrCompat(item.Hwnd, Native.GWL_EXSTYLE);
                    bool addedLayered = (curEx & Native.WS_EX_LAYERED) == 0;
                    if (addedLayered)
                    {
                        Native.SetWindowLongPtrCompat(item.Hwnd, Native.GWL_EXSTYLE, curEx | Native.WS_EX_LAYERED);
                    }
                    bool okAlpha = Native.SetLayeredWindowAttributes(item.Hwnd, 0, targetAlpha, Native.LWA_ALPHA);
                    uint ck, lflags;
                    byte actualAlpha = 0;
                    bool readOk = Native.GetLayeredWindowAttributes(item.Hwnd, out ck, out actualAlpha, out lflags);
                    if (!okAlpha || (readOk && (lflags & Native.LWA_ALPHA) != 0 && actualAlpha < 140))
                    {
                        // Fail-safe: never leave Antigravity invisible (alpha=0) or stuck behind wallpaper
                        RestoreHostAlphaOnly(item);
                        if (item.Backdrop != null && item.Backdrop.Handle != IntPtr.Zero)
                        {
                            Native.ShowWindow(item.Backdrop.Handle, Native.SW_HIDE);
                            item.BackdropVisible = false;
                        }
                        item.BackdropGuardBlocked = true;
                        item.BackdropBlockReason = "alpha-guard";
                        continue;
                    }
                    item.AlphaApplied = true;
                    item.LastAlpha = targetAlpha;
                }

                CommitPendingMoves(hudMoves);

                if (_lightbox != null)
                {
                    bool ownerAlive =
                        _lightboxOwnerHwnd != IntPtr.Zero &&
                        Native.IsWindow(_lightboxOwnerHwnd) &&
                        Native.IsWindowVisible(_lightboxOwnerHwnd) &&
                        !Native.IsIconic(_lightboxOwnerHwnd) &&
                        !Native.IsWindowCloaked(_lightboxOwnerHwnd);
                    if (!ownerAlive)
                    {
                        ImageLightboxWindow closingLb = _lightbox;
                        _lightbox = null;
                        _lightboxOwnerHwnd = IntPtr.Zero;
                        ForceCloseOwnedWindow(closingLb);
                    }
                    else
                    {
                        Native.RECT lbRect;
                        if (Native.TryGetVisibleBounds(_lightboxOwnerHwnd, out lbRect))
                        {
                            _lightbox.PositionOverBounds(
                                lbRect,
                                Native.GetWindowDpiScale(_lightboxOwnerHwnd),
                                Native.IsZoomed(_lightboxOwnerHwnd),
                                _config.radius,
                                true
                            );
                        }
                    }
                }

                if (_hudPopup != null)
                {
                    bool popOwnerAlive =
                        _hudPopupOwnerHwnd != IntPtr.Zero &&
                        Native.IsWindow(_hudPopupOwnerHwnd) &&
                        Native.IsWindowVisible(_hudPopupOwnerHwnd) &&
                        !Native.IsIconic(_hudPopupOwnerHwnd) &&
                        !Native.IsWindowCloaked(_hudPopupOwnerHwnd);
                    if (!popOwnerAlive)
                    {
                        CloseHudPopup();
                    }
                }

                if (_statusMenuItem != null)
                {
                    string stateDesc = _pausedByTray ? "已暂停" : activeEffect ? "壁纸运行中" : "待机";
                    _statusMenuItem.Text = string.Format("AGY 桌面伴侣 · {0} ({1} 窗)", stateDesc, _tracked.Count);
                }
            }
            finally
            {
                _inSync = false;
                if (_syncPending && !_disposed && _debounceTimer != null && !_debounceTimer.IsEnabled)
                {
                    _syncPending = false;
                    _debounceTimer.Start();
                }
            }
        }

        private List<IntPtr> FindAntigravityTopWindows()
        {
            return FindAntigravityTopWindowsStatic();
        }

        public static bool IsAntigravityHostProcessName(string procName)
        {
            if (string.IsNullOrEmpty(procName)) return false;
            return string.Equals(procName, "Antigravity", StringComparison.OrdinalIgnoreCase)
                || string.Equals(procName, "Antigravity_Original", StringComparison.OrdinalIgnoreCase);
        }

        public static List<IntPtr> FindAntigravityTopWindowsStatic()
        {
            var found = new List<IntPtr>();
            var cls = new StringBuilder(128);
            var pidCache = new Dictionary<uint, string>();

            Native.EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
            {
                if (!Native.IsWindowVisible(hWnd)) return true;
                if (Native.GetWindow(hWnd, Native.GW_OWNER) != IntPtr.Zero) return true;
                long ex = Native.GetWindowLongPtrCompat(hWnd, Native.GWL_EXSTYLE);
                if ((ex & Native.WS_EX_TOOLWINDOW) != 0) return true;

                cls.Clear();
                Native.GetClassName(hWnd, cls, cls.Capacity);
                if (!string.Equals(cls.ToString(), "Chrome_WidgetWin_1", StringComparison.Ordinal)) return true;

                uint pid;
                Native.GetWindowThreadProcessId(hWnd, out pid);
                string procName;
                if (!pidCache.TryGetValue(pid, out procName))
                {
                    procName = Native.GetProcessBaseNameFast(pid);
                    pidCache[pid] = procName;
                }
                if (!IsAntigravityHostProcessName(procName)) return true;

                // Keep minimized Antigravity windows tracked (their rect is -32000x160x28 while iconic)
                // so minimize/restore hides & reveals overlays cleanly without thrashing WPF windows.
                if (!Native.IsIconic(hWnd))
                {
                    Native.RECT r;
                    if (!Native.GetWindowRect(hWnd, out r)) return true;
                    if ((r.Right - r.Left) < 300 || (r.Bottom - r.Top) < 240) return true;
                }

                found.Add(hWnd);
                return true;
            }, IntPtr.Zero);

            return found;
        }

        private void RestoreHostAlphaOnly(TrackedHostWindow item)
        {
            if (item == null) return;
            if (Native.IsWindow(item.Hwnd))
            {
                try
                {
                    byte curAlpha;
                    bool isTranslucent = Native.IsWindowTranslucentLayered(item.Hwnd, out curAlpha);
                    if (item.AlphaApplied || isTranslucent)
                    {
                        long curEx = Native.GetWindowLongPtrCompat(item.Hwnd, Native.GWL_EXSTYLE);
                        if (item.OriginallyLayered && !isTranslucent)
                        {
                            Native.SetLayeredWindowAttributes(item.Hwnd, 0, 255, Native.LWA_ALPHA);
                        }
                        else if ((curEx & Native.WS_EX_LAYERED) != 0)
                        {
                            Native.SetWindowLongPtrCompat(item.Hwnd, Native.GWL_EXSTYLE, curEx & ~Native.WS_EX_LAYERED);
                            Native.RedrawWindow(item.Hwnd, IntPtr.Zero, IntPtr.Zero, Native.RDW_INVALIDATE | Native.RDW_FRAME | Native.RDW_UPDATENOW);
                        }
                    }
                }
                catch { }
            }
            item.AlphaApplied = false;
            item.LastAlpha = 255;
        }

        private bool HasAnyActiveBackdropSurface()
        {
            foreach (TrackedHostWindow other in _tracked.Values)
            {
                if (other != null && other.Backdrop != null) return true;
            }
            return false;
        }

        private void RestoreBackdropOnly(TrackedHostWindow item, bool closing)
        {
            if (item == null) return;
            RestoreHostAlphaOnly(item);

            if (item.Backdrop != null)
            {
                BackdropSurfaceWindow closingBackdrop = item.Backdrop;
                item.Backdrop = null;
                item.BackdropVisible = false;
                item.LastWidth = 0;
                item.LastHeight = 0;
                item.AppliedConfigVersion = 0;
                try { closingBackdrop.ReleaseSurfaceResources(); } catch { }
                ForceCloseOwnedWindow(closingBackdrop);
            }

            if (!IsBackdropEffectWanted() || (closing && !HasAnyActiveBackdropSurface()))
            {
                ReleaseSharedWallpaperBitmaps();
            }
        }

        private void RestoreHostWindow(TrackedHostWindow item, bool closing)
        {
            if (item == null) return;
            RestoreBackdropOnly(item, closing);
            if (item.Hud != null)
            {
                if (closing)
                {
                    HudOverlayWindow closingHud = item.Hud;
                    item.Hud = null;
                    item.HudVisible = false;
                    ForceCloseOwnedWindow(closingHud);
                }
                else
                {
                    HideHudIfVisible(item);
                }
            }
        }

        private void WriteStatusFile(bool running)
        {
            try
            {
                _lastStatusWriteUtc = DateTime.UtcNow;
                long epochMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                bool isCssMode = string.Equals(_config.hostThemeMode, "cdp", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(_config.hostThemeMode, "inject", StringComparison.OrdinalIgnoreCase);
                bool activeEffect = running && _config.backdropEnabled && !_pausedByTray && _cachedBitmap != null && !isCssMode;
                byte alpha = activeEffect
                    ? (byte)Math.Max(148, Math.Min(254, Math.Round(255.0 * (100 - _config.hostBlendPct) / 100.0)))
                    : (byte)255;

                bool anyHudVisible = false;
                bool anyHudAnchor = false;
                bool anyHudOccluded = false;
                bool anyBackdropBlocked = false;
                string occReason = "";
                string blockReason = "";
                bool anyBackdropVisible = false;
                bool anyHostTranslucent = false;
                bool anyHostVisible = false;
                string hostHiddenReason = "";
                byte observedAlpha = 255;
                foreach (TrackedHostWindow item in _tracked.Values)
                {
                    if (Native.IsWindow(item.Hwnd))
                    {
                        bool hv = Native.IsWindowVisible(item.Hwnd);
                        bool hi = Native.IsIconic(item.Hwnd);
                        bool hc = Native.IsWindowCloaked(item.Hwnd);
                        if (hv && !hi && !hc)
                        {
                            anyHostVisible = true;
                        }
                        else if (string.IsNullOrEmpty(hostHiddenReason))
                        {
                            hostHiddenReason = hi ? "iconic" : (hc ? "cloaked" : "invisible");
                        }
                    }
                    if (item.Backdrop != null && item.Backdrop.Handle != IntPtr.Zero && Native.IsWindowVisible(item.Backdrop.Handle))
                    {
                        anyBackdropVisible = true;
                    }
                    byte curA;
                    if (Native.IsWindowTranslucentLayered(item.Hwnd, out curA))
                    {
                        anyHostTranslucent = true;
                        observedAlpha = curA;
                    }
                    if (item.HudVisible) anyHudVisible = true;
                    if (item.Anchor.HasAnchor && item.Anchor.FromUia) anyHudAnchor = true;
                    if (item.BackdropGuardBlocked)
                    {
                        anyBackdropBlocked = true;
                        if (!string.IsNullOrEmpty(item.BackdropBlockReason)) blockReason = item.BackdropBlockReason;
                    }
                    if (item.ConsoleOccluded)
                    {
                        anyHudOccluded = true;
                        occReason = "console-fullscreen";
                    }
                    else if (item.Anchor.Occluded)
                    {
                        anyHudOccluded = true;
                        if (!string.IsNullOrEmpty(item.LastOccludedReason)) occReason = item.LastOccludedReason;
                    }
                }

                var payload = new Dictionary<string, object>
                {
                    { "pid", _selfPid },
                    { "running", running },
                    { "activeEffect", activeEffect && !anyBackdropBlocked },
                    { "backdropGuardBlocked", running && anyBackdropBlocked },
                    { "backdropBlockReason", running ? blockReason : "" },
                    { "supportsLightbox", true },
                    { "paused", _pausedByTray },
                    { "trackedCount", _tracked.Count },
                    { "appliedAlpha", anyHostTranslucent ? (int)observedAlpha : (int)alpha },
                    { "actualBackdropVisible", running && anyBackdropVisible },
                    { "actualHostTranslucent", running && anyHostTranslucent },
                    { "hostVisible", running && anyHostVisible },
                    { "hostHiddenReason", running ? (anyHostVisible ? "" : hostHiddenReason) : "" },
                    { "backdropHideCount", _backdropHideCount },
                    { "backdropLastHideReason", _backdropLastHideReason },
                    { "backdropZFixCount", _backdropZFixCount },
                    { "backdropZBlockerClass", _backdropZBlockerClass },
                    { "hostBlendPct", _config.hostBlendPct },
                    { "activeWallpaperId", _config.activeWallpaperId ?? "" },
                    { "hudEnabled", _config.hudEnabled && _hudEnabledByTray },
                    { "zeroUiaMode", _config.zeroUiaMode },
                    { "hudVisible", running && anyHudVisible },
                    { "hudAnchorFound", running && anyHudAnchor },
                    { "hudOccluded", running && anyHudOccluded },
                    { "hudOccludedReason", running ? occReason : "" },
                    { "hudOccludedDetail", running && anyHudOccluded ? (UiaHelper.LastOcclusionDebug ?? "") : "" },
                    { "hudActiveWorkspace", _lastViewWorkspace ?? "" },
                    { "hudActiveTitle", _lastViewTitle ?? "" },
                    { "hudLastAction", _hudLastAction ?? "" },
                    { "desktopName", Native.GetDesktopName() },
                    { "updatedAtMs", epochMs }
                };
                string tmp = _statusPath + ".tmp";
                File.WriteAllText(tmp, _json.Serialize(payload), Encoding.UTF8);
                try
                {
                    if (File.Exists(_statusPath))
                    {
                        File.Replace(tmp, _statusPath, null);
                    }
                    else
                    {
                        File.Move(tmp, _statusPath);
                    }
                }
                catch
                {
                    File.Copy(tmp, _statusPath, true);
                    try { File.Delete(tmp); } catch { }
                }
            }
            catch { }
        }

        private void ShutdownGracefully()
        {
            Dispose();
            System.Windows.Application.Current.Shutdown(0);
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            try { StopRenderFollow(); } catch { }
            DetachDragLocationHook();
            try { UninstallSystemEvents(); } catch { }
            try { if (_debounceTimer != null) _debounceTimer.Stop(); } catch { }
            try { if (_reconcileTimer != null) _reconcileTimer.Stop(); } catch { }
            try { if (_fastStateTimer != null) _fastStateTimer.Stop(); } catch { }
            try { if (_watcher != null) _watcher.Dispose(); } catch { }
            foreach (IntPtr h in _hooks)
            {
                try { Native.UnhookWinEvent(h); } catch { }
            }
            _hooks.Clear();
            foreach (List<IntPtr> pidList in _hostPidHooks.Values)
            {
                for (int i = 0; i < pidList.Count; i++)
                {
                    try { Native.UnhookWinEvent(pidList[i]); } catch { }
                }
            }
            _hostPidHooks.Clear();

            foreach (TrackedHostWindow item in _tracked.Values)
            {
                RestoreHostWindow(item, true);
            }
            _tracked.Clear();
            ReleaseSharedWallpaperBitmaps();
            if (_lightbox != null)
            {
                ImageLightboxWindow closingLightbox = _lightbox;
                _lightbox = null;
                _lightboxOwnerHwnd = IntPtr.Zero;
                ForceCloseOwnedWindow(closingLightbox);
            }
            CloseHudPopup();
            SweepOrphanedWindows();

            WriteStatusFile(false);

            try
            {
                if (_trayIcon != null)
                {
                    _trayIcon.Visible = false;
                    _trayIcon.Icon = null;
                    _trayIcon.ContextMenuStrip = null;
                    _trayIcon.Dispose();
                    _trayIcon = null;
                }
                if (_trayMenu != null)
                {
                    _trayMenu.Dispose();
                    _trayMenu = null;
                }
                if (_trayIconGlyph != null)
                {
                    _trayIconGlyph.Dispose();
                    _trayIconGlyph = null;
                }
                if (_trayIconHandle != IntPtr.Zero)
                {
                    Native.DestroyIcon(_trayIconHandle);
                    _trayIconHandle = IntPtr.Zero;
                }
            }
            catch { }

            try
            {
                if (_stopEvent != null)
                {
                    _stopEvent.Set();
                    _stopEvent.Dispose();
                    _stopEvent = null;
                }
            }
            catch { }

            try
            {
                if (_trimEvent != null)
                {
                    _trimEvent.Set();
                    _trimEvent.Dispose();
                    _trimEvent = null;
                }
            }
            catch { }

            try
            {
                _uiaWakeEvent.Set();
                _uiaWakeEvent.Dispose();
            }
            catch { }
        }

        private static bool ReadBool(Dictionary<string, object> d, string key, bool fallback)
        {
            object v;
            if (d != null && d.TryGetValue(key, out v) && v is bool) return (bool)v;
            return fallback;
        }

        private static int ReadInt(Dictionary<string, object> d, string key, int fallback)
        {
            object v;
            if (d == null || !d.TryGetValue(key, out v) || v == null) return fallback;
            try { return Convert.ToInt32(v); } catch { return fallback; }
        }

        private static long ReadLong(Dictionary<string, object> d, string key, long fallback)
        {
            object v;
            if (d == null || !d.TryGetValue(key, out v) || v == null) return fallback;
            try { return Convert.ToInt64(v); } catch { return fallback; }
        }

        private static int? ReadNullableInt(Dictionary<string, object> d, string key)
        {
            object v;
            if (d == null || !d.TryGetValue(key, out v) || v == null) return null;
            try { return Convert.ToInt32(v, CultureInfo.InvariantCulture); } catch { return null; }
        }

        private static double? ReadNullableDouble(Dictionary<string, object> d, string key)
        {
            object v;
            if (d == null || !d.TryGetValue(key, out v) || v == null) return null;
            try { return Convert.ToDouble(v, CultureInfo.InvariantCulture); } catch { return null; }
        }

        private static string ReadString(Dictionary<string, object> d, string key, string fallback)
        {
            object v;
            if (d != null && d.TryGetValue(key, out v) && v != null) return Convert.ToString(v);
            return fallback;
        }

        private static int ClampInt(int v, int min, int max)
        {
            return Math.Max(min, Math.Min(max, v));
        }

        public void LogFatalException(string source, Exception ex)
        {
            try
            {
                string logPath = System.IO.Path.Combine(_dataDir, "backdrop_error.log");
                string msg = string.Format(
                    "[{0}] {1}: {2}\r\n",
                    DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                    source ?? "unknown",
                    ex != null ? ex.ToString() : "(null)"
                );
                File.AppendAllText(logPath, msg, Encoding.UTF8);
            }
            catch { }
        }

        public static int RestoreAllAntigravityWindowsOpaqueStatic()
        {
            int restored = 0;
            try
            {
                List<IntPtr> hosts = FindAntigravityTopWindowsStatic();
                for (int i = 0; i < hosts.Count; i++)
                {
                    IntPtr h = hosts[i];
                    byte curAlpha;
                    if (Native.IsWindowTranslucentLayered(h, out curAlpha))
                    {
                        Native.ForceRestoreWindowOpaque(h, false);
                        restored++;
                    }
                }
            }
            catch { }
            return restored;
        }

        public void RestoreAllHostOpacityEmergency()
        {
            try
            {
                var snapshot = new List<TrackedHostWindow>(_tracked.Values);
                for (int i = 0; i < snapshot.Count; i++)
                {
                    TrackedHostWindow item = snapshot[i];
                    if (item == null || !Native.IsWindow(item.Hwnd)) continue;
                    byte curAlpha;
                    bool isTranslucent = Native.IsWindowTranslucentLayered(item.Hwnd, out curAlpha);
                    if (!item.AlphaApplied && !isTranslucent) continue;
                    try
                    {
                        if (item.OriginallyLayered && !isTranslucent)
                        {
                            Native.SetLayeredWindowAttributes(item.Hwnd, 0, 255, Native.LWA_ALPHA);
                        }
                        else
                        {
                            long curEx = Native.GetWindowLongPtrCompat(item.Hwnd, Native.GWL_EXSTYLE);
                            Native.SetWindowLongPtrCompat(item.Hwnd, Native.GWL_EXSTYLE, curEx & ~Native.WS_EX_LAYERED);
                            Native.RedrawWindow(item.Hwnd, IntPtr.Zero, IntPtr.Zero, Native.RDW_INVALIDATE | Native.RDW_FRAME | Native.RDW_UPDATENOW);
                        }
                    }
                    catch { }
                    item.AlphaApplied = false;
                    item.LastAlpha = 255;
                }
            }
            catch { }
            RestoreAllAntigravityWindowsOpaqueStatic();
        }

        public static void SignalExistingStop()
        {
            try
            {
                using (var ev = EventWaitHandle.OpenExisting(StopEventName))
                {
                    ev.Set();
                }
            }
            catch { }
        }
    }

    internal static class MemoryHelper
    {
        private const uint TH32CS_SNAPPROCESS = 0x00000002;
        private const uint TH32CS_SNAPMODULE = 0x00000008;
        private const uint TH32CS_SNAPMODULE32 = 0x00000010;
        private const uint PROCESS_QUERY_INFORMATION = 0x0400;
        private const uint PROCESS_VM_READ = 0x0010;
        private const uint PROCESS_SET_QUOTA = 0x0100;
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        private const int ERROR_BAD_LENGTH = 24;
        private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct PROCESSENTRY32W
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct MODULEENTRY32W
        {
            public uint dwSize;
            public uint th32ModuleID;
            public uint th32ProcessID;
            public uint GlblcntUsage;
            public uint ProccntUsage;
            public IntPtr modBaseAddr;
            public uint modBaseSize;
            public IntPtr hModule;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string szModule;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExePath;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_MEMORY_COUNTERS_EX
        {
            public uint cb;
            public uint PageFaultCount;
            public UIntPtr PeakWorkingSetSize;
            public UIntPtr WorkingSetSize;
            public UIntPtr QuotaPeakPagedPoolUsage;
            public UIntPtr QuotaPagedPoolUsage;
            public UIntPtr QuotaPeakNonPagedPoolUsage;
            public UIntPtr QuotaNonPagedPoolUsage;
            public UIntPtr PagefileUsage;
            public UIntPtr PeakPagefileUsage;
            public UIntPtr PrivateUsage;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MEMORYSTATUSEX
        {
            public uint dwLength;
            public uint dwMemoryLoad;
            public ulong ullTotalPhys;
            public ulong ullAvailPhys;
            public ulong ullTotalPageFile;
            public ulong ullAvailPageFile;
            public ulong ullTotalVirtual;
            public ulong ullAvailVirtual;
            public ulong ullAvailExtendedVirtual;
        }

        private sealed class ProcEntry
        {
            public int Pid;
            public int Ppid;
            public string Name;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32FirstW(IntPtr hSnapshot, ref PROCESSENTRY32W lppe);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32NextW(IntPtr hSnapshot, ref PROCESSENTRY32W lppe);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Module32FirstW(IntPtr hSnapshot, ref MODULEENTRY32W lpme);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Module32NextW(IntPtr hSnapshot, ref MODULEENTRY32W lpme);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetProcessWorkingSetSize(IntPtr hProcess, IntPtr dwMinimumWorkingSetSize, IntPtr dwMaximumWorkingSetSize);

        [DllImport("psapi.dll", SetLastError = true)]
        private static extern bool GetProcessMemoryInfo(IntPtr hProcess, out PROCESS_MEMORY_COUNTERS_EX ppsmemCounters, uint cb);

        [DllImport("psapi.dll", SetLastError = true)]
        private static extern bool QueryWorkingSet(IntPtr hProcess, IntPtr pv, uint cb);

        [DllImport("psapi.dll", SetLastError = true)]
        private static extern bool EmptyWorkingSet(IntPtr hProcess);

        private static string StripExeSuffix(string exeName)
        {
            if (string.IsNullOrEmpty(exeName)) return "";
            if (exeName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                return exeName.Substring(0, exeName.Length - 4);
            }
            return exeName;
        }

        private static bool IsCoreAgyProcessName(string name)
        {
            if (string.IsNullOrEmpty(name)) return false;
            if (string.Equals(name, "Antigravity", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(name, "Antigravity_Original", StringComparison.OrdinalIgnoreCase)) return true;
            if (name.StartsWith("language_server", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(name, "agy_backdrop", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(name, "agy_desktop_pet", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(name, "agy_account_tool", StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        private static List<ProcEntry> EnumerateAllProcesses()
        {
            var list = new List<ProcEntry>();
            IntPtr snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if (snap == IntPtr.Zero || snap == INVALID_HANDLE_VALUE) return list;
            try
            {
                var pe = new PROCESSENTRY32W();
                pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
                if (Process32FirstW(snap, ref pe))
                {
                    do
                    {
                        list.Add(new ProcEntry
                        {
                            Pid = (int)pe.th32ProcessID,
                            Ppid = (int)pe.th32ParentProcessID,
                            Name = StripExeSuffix(pe.szExeFile ?? "")
                        });
                    }
                    while (Process32NextW(snap, ref pe));
                }
            }
            finally
            {
                CloseHandle(snap);
            }
            return list;
        }

        private static bool HasAncestorInSet(int pid, Dictionary<int, ProcEntry> byPid, HashSet<int> roots)
        {
            int cur = pid;
            for (int depth = 0; depth < 8; depth++)
            {
                ProcEntry e;
                if (!byPid.TryGetValue(cur, out e)) return false;
                if (e.Ppid <= 0 || e.Ppid == cur) return false;
                if (roots.Contains(e.Ppid)) return true;
                cur = e.Ppid;
            }
            return false;
        }

        private static long QueryPrivateWorkingSetBytes(IntPtr hProcess)
        {
            int pageSize = Environment.SystemPageSize;
            if (pageSize <= 0) pageSize = 4096;
            int ptrSize = IntPtr.Size;
            uint bufBytes = 256 * 1024;
            for (int attempt = 0; attempt < 4; attempt++)
            {
                IntPtr buf = Marshal.AllocHGlobal((int)bufBytes);
                try
                {
                    bool ok = QueryWorkingSet(hProcess, buf, bufBytes);
                    if (!ok)
                    {
                        int err = Marshal.GetLastWin32Error();
                        if (err == ERROR_BAD_LENGTH)
                        {
                            long neededEntries = Marshal.ReadIntPtr(buf, 0).ToInt64();
                            if (neededEntries > 0 && neededEntries < 16 * 1024 * 1024)
                            {
                                long neededBytes = (neededEntries + 2048L) * ptrSize;
                                if (neededBytes > (long)bufBytes && neededBytes <= 64L * 1024 * 1024)
                                {
                                    bufBytes = (uint)neededBytes;
                                    continue;
                                }
                            }
                            bufBytes = Math.Min(64u * 1024u * 1024u, bufBytes * 4u);
                            continue;
                        }
                        return -1;
                    }

                    long count = Marshal.ReadIntPtr(buf, 0).ToInt64();
                    long maxEntries = ((long)bufBytes / ptrSize) - 1;
                    if (count < 0) return -1;
                    if (count > maxEntries) count = maxEntries;

                    long privatePages = 0;
                    for (long i = 0; i < count; i++)
                    {
                        int offset = (int)((i + 1) * ptrSize);
                        ulong entry = (ptrSize == 8)
                            ? (ulong)Marshal.ReadInt64(buf, offset)
                            : (ulong)(uint)Marshal.ReadInt32(buf, offset);
                        // Bit 8 (0x100) is PSAPI_WORKING_SET_BLOCK.Shared
                        if ((entry & 0x100UL) == 0UL)
                        {
                            privatePages++;
                        }
                    }
                    return privatePages * (long)pageSize;
                }
                finally
                {
                    Marshal.FreeHGlobal(buf);
                }
            }
            return -1;
        }

        private static bool IsModuleLoaded(int pid, string moduleFileName)
        {
            IntPtr snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, (uint)pid);
            if (snap == IntPtr.Zero || snap == INVALID_HANDLE_VALUE) return false;
            try
            {
                var me = new MODULEENTRY32W();
                me.dwSize = (uint)Marshal.SizeOf(typeof(MODULEENTRY32W));
                if (Module32FirstW(snap, ref me))
                {
                    do
                    {
                        if (string.Equals(me.szModule, moduleFileName, StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }
                    }
                    while (Module32NextW(snap, ref me));
                }
            }
            catch { }
            finally
            {
                CloseHandle(snap);
            }
            return false;
        }

        private static double BytesToMb(long bytes)
        {
            if (bytes <= 0) return 0.0;
            return Math.Round(bytes / (1024.0 * 1024.0), 1);
        }

        private static List<ProcEntry> FilterTargetProcesses(List<ProcEntry> all, HashSet<int> extraPids, int selfPid)
        {
            var byPid = new Dictionary<int, ProcEntry>(all.Count);
            var corePids = new HashSet<int>();
            for (int i = 0; i < all.Count; i++)
            {
                ProcEntry e = all[i];
                byPid[e.Pid] = e;
                if (IsCoreAgyProcessName(e.Name))
                {
                    corePids.Add(e.Pid);
                }
            }

            var matched = new List<ProcEntry>();
            for (int i = 0; i < all.Count; i++)
            {
                ProcEntry e = all[i];
                if (e.Pid == selfPid) continue;
                bool isExtra = extraPids != null && extraPids.Contains(e.Pid);
                bool isCore = corePids.Contains(e.Pid);
                bool isAgyNodeChild = !isCore &&
                    string.Equals(e.Name, "node", StringComparison.OrdinalIgnoreCase) &&
                    HasAncestorInSet(e.Pid, byPid, corePids);
                if (isCore || isExtra || isAgyNodeChild)
                {
                    matched.Add(e);
                }
            }
            return matched;
        }

        private static HashSet<int> FindMainWindowPids()
        {
            var pids = new HashSet<int>();
            try
            {
                List<IntPtr> hwnds = CompanionController.FindAntigravityTopWindowsStatic();
                for (int i = 0; i < hwnds.Count; i++)
                {
                    uint p;
                    Native.GetWindowThreadProcessId(hwnds[i], out p);
                    if (p > 0) pids.Add((int)p);
                }
            }
            catch { }
            return pids;
        }

        private static Dictionary<string, object> CaptureSnapshotData(HashSet<int> extraPids, bool inspectUia)
        {
            int selfPid;
            using (Process cur = Process.GetCurrentProcess()) selfPid = cur.Id;

            var sys = new Dictionary<string, object>();
            try
            {
                var ms = new MEMORYSTATUSEX();
                ms.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
                if (GlobalMemoryStatusEx(ref ms))
                {
                    sys["totalMb"] = Math.Round(ms.ullTotalPhys / (1024.0 * 1024.0), 0);
                    sys["availableMb"] = Math.Round(ms.ullAvailPhys / (1024.0 * 1024.0), 0);
                    sys["loadPct"] = (int)ms.dwMemoryLoad;
                }
            }
            catch { }

            List<ProcEntry> all = EnumerateAllProcesses();
            List<ProcEntry> targets = FilterTargetProcesses(all, extraPids, selfPid);
            HashSet<int> mainWinPids = FindMainWindowPids();
            DateTime nowUtc = DateTime.UtcNow;

            var procsOut = new List<Dictionary<string, object>>(targets.Count);
            long totalPrivWsBytes = 0;
            long totalWsBytes = 0;
            long totalCommitBytes = 0;

            for (int i = 0; i < targets.Count; i++)
            {
                ProcEntry e = targets[i];
                long wsBytes = 0;
                long commitBytes = 0;
                long privWsBytes = -1;
                IntPtr hProc = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, (uint)e.Pid);
                if (hProc == IntPtr.Zero)
                {
                    hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)e.Pid);
                }
                if (hProc == IntPtr.Zero) continue;

                try
                {
                    var pmc = new PROCESS_MEMORY_COUNTERS_EX();
                    pmc.cb = (uint)Marshal.SizeOf(typeof(PROCESS_MEMORY_COUNTERS_EX));
                    if (GetProcessMemoryInfo(hProc, out pmc, pmc.cb))
                    {
                        wsBytes = (long)pmc.WorkingSetSize.ToUInt64();
                        commitBytes = (long)pmc.PrivateUsage.ToUInt64();
                    }
                    privWsBytes = QueryPrivateWorkingSetBytes(hProc);
                }
                catch { }
                finally
                {
                    CloseHandle(hProc);
                }

                if (privWsBytes < 0)
                {
                    privWsBytes = (commitBytes > 0 && wsBytes > 0) ? Math.Min(wsBytes, commitBytes) : wsBytes;
                }

                bool hasMainWin = mainWinPids.Contains(e.Pid);
                bool uiaLoaded = false;
                if (inspectUia && CompanionController.IsAntigravityHostProcessName(e.Name) && (hasMainWin || privWsBytes >= 120L * 1024 * 1024))
                {
                    uiaLoaded = IsModuleLoaded(e.Pid, "uiautomationcore.dll");
                }

                long uptimeSec = 0;
                try
                {
                    using (Process p = Process.GetProcessById(e.Pid))
                    {
                        double sec = (nowUtc - p.StartTime.ToUniversalTime()).TotalSeconds;
                        if (sec > 0) uptimeSec = (long)Math.Round(sec);
                    }
                }
                catch { }

                totalPrivWsBytes += Math.Max(0, privWsBytes);
                totalWsBytes += Math.Max(0, wsBytes);
                totalCommitBytes += Math.Max(0, commitBytes);

                procsOut.Add(new Dictionary<string, object>
                {
                    { "pid", e.Pid },
                    { "ppid", e.Ppid },
                    { "name", e.Name },
                    { "hasMainWindow", hasMainWin },
                    { "uiaLoaded", uiaLoaded },
                    { "privateWsMb", BytesToMb(privWsBytes) },
                    { "workingSetMb", BytesToMb(wsBytes) },
                    { "privateCommitMb", BytesToMb(commitBytes) },
                    { "uptimeSec", uptimeSec }
                });
            }

            long epochMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            return new Dictionary<string, object>
            {
                { "ok", true },
                { "ts", epochMs },
                { "system", sys },
                { "totalPrivateWsMb", BytesToMb(totalPrivWsBytes) },
                { "totalWorkingSetMb", BytesToMb(totalWsBytes) },
                { "totalPrivateCommitMb", BytesToMb(totalCommitBytes) },
                { "processCount", procsOut.Count },
                { "processes", procsOut }
            };
        }

        private static void SignalNamedEventSafe(string eventName)
        {
            try
            {
                using (var ev = EventWaitHandle.OpenExisting(eventName))
                {
                    ev.Set();
                }
            }
            catch { }
        }

        public static string CaptureMemorySnapshotJson(HashSet<int> extraPids)
        {
            var json = new JavaScriptSerializer();
            json.MaxJsonLength = 8 * 1024 * 1024;
            Dictionary<string, object> snap = CaptureSnapshotData(extraPids, true);
            return json.Serialize(snap);
        }

        public static string TrimAllAntigravityMemoryJson(HashSet<int> extraPids)
        {
            int selfPid;
            using (Process cur = Process.GetCurrentProcess()) selfPid = cur.Id;

            Dictionary<string, object> before = CaptureSnapshotData(extraPids, false);

            // Trigger full managed Gen-2 GC + Finalizers inside our own running C# companions first
            SignalNamedEventSafe(@"Local\AgyMonitorBackdropTrim");
            SignalNamedEventSafe(@"Local\AgyDesktopPetTrim");

            List<ProcEntry> all = EnumerateAllProcesses();
            List<ProcEntry> targets = FilterTargetProcesses(all, extraPids, selfPid);
            int trimmedCount = 0;
            int failedCount = 0;

            for (int i = 0; i < targets.Count; i++)
            {
                ProcEntry e = targets[i];
                IntPtr hProc = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA, false, (uint)e.Pid);
                if (hProc == IntPtr.Zero)
                {
                    failedCount++;
                    continue;
                }
                try
                {
                    bool ok = EmptyWorkingSet(hProc);
                    if (!ok)
                    {
                        ok = SetProcessWorkingSetSize(hProc, new IntPtr(-1), new IntPtr(-1));
                    }
                    if (ok) trimmedCount++;
                    else failedCount++;
                }
                catch
                {
                    failedCount++;
                }
                finally
                {
                    CloseHandle(hProc);
                }
            }

            // Brief pause so companion GC + OS working set trim settle before reading after-snapshot
            Thread.Sleep(220);

            Dictionary<string, object> after = CaptureSnapshotData(extraPids, true);
            double beforeMb = Convert.ToDouble(before["totalPrivateWsMb"], CultureInfo.InvariantCulture);
            double afterMb = Convert.ToDouble(after["totalPrivateWsMb"], CultureInfo.InvariantCulture);
            double freedMb = Math.Round(Math.Max(0.0, beforeMb - afterMb), 1);

            var payload = new Dictionary<string, object>
            {
                { "ok", true },
                { "trimmedCount", trimmedCount },
                { "failedCount", failedCount },
                { "beforeTotalPrivateWsMb", beforeMb },
                { "afterTotalPrivateWsMb", afterMb },
                { "freedMb", freedMb },
                { "snapshot", after }
            };

            var json = new JavaScriptSerializer();
            json.MaxJsonLength = 8 * 1024 * 1024;
            return json.Serialize(payload);
        }
    }

    internal static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            Native.EnablePerMonitorDpi();

            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string dataDir = System.IO.Path.Combine(home, ".gemini", "antigravity", "plugin_data", "agy-monitor");
            string assetsDir = System.IO.Path.Combine(home, ".gemini", "config", "plugins", "agy-monitor", "assets", "wallpapers");
            bool stopMode = false;
            bool probeDesktopMode = false;
            bool restoreOpacityMode = false;
            bool memorySnapshotMode = false;
            bool trimMemoryMode = false;
            int parentPid = 0;
            var extraPids = new HashSet<int>();

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--stop") stopMode = true;
                else if (args[i] == "--probe-desktop") probeDesktopMode = true;
                else if (args[i] == "--restore-opacity") restoreOpacityMode = true;
                else if (args[i] == "--memory-snapshot") memorySnapshotMode = true;
                else if (args[i] == "--trim-memory") trimMemoryMode = true;
                else if (string.Equals(args[i], "--parent-pid", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                {
                    int parsedParentPid;
                    if (int.TryParse(args[++i], NumberStyles.Integer, CultureInfo.InvariantCulture, out parsedParentPid) && parsedParentPid > 0)
                    {
                        parentPid = parsedParentPid;
                    }
                }
                else if (args[i] == "--extra-pids" && i + 1 < args.Length)
                {
                    string rawPids = args[++i] ?? "";
                    string[] parts = rawPids.Split(new char[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    for (int pIdx = 0; pIdx < parts.Length; pIdx++)
                    {
                        int parsedPid;
                        if (int.TryParse(parts[pIdx].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsedPid) && parsedPid > 0)
                        {
                            extraPids.Add(parsedPid);
                        }
                    }
                }
                else if (args[i] == "--data-dir" && i + 1 < args.Length) dataDir = args[++i];
                else if (args[i] == "--assets-dir" && i + 1 < args.Length) assetsDir = args[++i];
            }

            if (probeDesktopMode)
            {
                Console.WriteLine(Native.GetDesktopName());
                return 0;
            }

            if (memorySnapshotMode)
            {
                try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }
                Console.WriteLine(MemoryHelper.CaptureMemorySnapshotJson(extraPids));
                return 0;
            }

            if (trimMemoryMode)
            {
                try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }
                Console.WriteLine(MemoryHelper.TrimAllAntigravityMemoryJson(extraPids));
                return 0;
            }

            if (restoreOpacityMode)
            {
                CompanionController.RestoreAllAntigravityWindowsOpaqueStatic();
                return 0;
            }

            if (stopMode)
            {
                CompanionController.SignalExistingStop();
                return 0;
            }

            bool createdNew;
            using (var mutex = new Mutex(true, @"Local\AgyMonitorBackdropSingleton", out createdNew))
            {
                if (!createdNew)
                {
                    return 0;
                }

                var app = new System.Windows.Application
                {
                    ShutdownMode = ShutdownMode.OnExplicitShutdown
                };

                var controller = new CompanionController(dataDir, assetsDir, app.Dispatcher, parentPid);
                int recentUiExceptions = 0;
                DateTime uiExceptionWindowStart = DateTime.UtcNow;
                app.DispatcherUnhandledException += delegate(object sender, DispatcherUnhandledExceptionEventArgs e)
                {
                    try { controller.LogFatalException("DispatcherUnhandledException", e.Exception); } catch { }
                    DateTime nowUtc = DateTime.UtcNow;
                    if ((nowUtc - uiExceptionWindowStart).TotalSeconds > 30.0)
                    {
                        uiExceptionWindowStart = nowUtc;
                        recentUiExceptions = 0;
                    }
                    recentUiExceptions++;
                    if (recentUiExceptions < 5)
                    {
                        // Recover non-fatal UI glitches (e.g., popup/lightbox race) without killing the backdrop companion!
                        try { controller.RecoverFromNonFatalUiException(); } catch { }
                        e.Handled = true;
                        return;
                    }
                    try { controller.Dispose(); } catch { try { controller.RestoreAllHostOpacityEmergency(); } catch { } }
                    e.Handled = false;
                };
                AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
                {
                    try { controller.LogFatalException("UnhandledException", e.ExceptionObject as Exception); } catch { }
                    try
                    {
                        if (app.Dispatcher != null && !app.Dispatcher.CheckAccess() && !app.Dispatcher.HasShutdownStarted)
                        {
                            app.Dispatcher.Invoke(DispatcherPriority.Send, TimeSpan.FromSeconds(2), new Action(controller.Dispose));
                        }
                        else
                        {
                            controller.Dispose();
                        }
                    }
                    catch
                    {
                        try { controller.RestoreAllHostOpacityEmergency(); } catch { }
                    }
                };
                AppDomain.CurrentDomain.ProcessExit += delegate
                {
                    try
                    {
                        if (app.Dispatcher != null && !app.Dispatcher.CheckAccess() && !app.Dispatcher.HasShutdownStarted)
                        {
                            app.Dispatcher.Invoke(DispatcherPriority.Send, TimeSpan.FromSeconds(2), new Action(controller.Dispose));
                        }
                        else
                        {
                            controller.Dispose();
                        }
                    }
                    catch
                    {
                        try { controller.RestoreAllHostOpacityEmergency(); } catch { }
                    }
                };
                app.Exit += delegate { controller.Dispose(); };

                controller.Start();
                app.Run();
                controller.Dispose();
                return 0;
            }
        }
    }
}
