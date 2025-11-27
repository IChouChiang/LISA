import psutil
import time
import sys

def find_backend_process():
    """Finds the Go backend process by looking for main.exe or go run main.go"""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            # Check for the compiled binary or the go run command
            if proc.info['name'] == 'main.exe':
                return proc
            # Check for 'go run main.go' (often appears as 'go.exe' with arguments)
            if proc.info['cmdline'] and 'main.go' in ' '.join(proc.info['cmdline']):
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return None

def monitor():
    print("🔍 Searching for LISA Backend process...")
    backend = find_backend_process()
    
    if not backend:
        print("❌ Backend not found! Make sure 'go run main.go' is running.")
        print("   (Note: This script tracks the Go backend. Browser usage is harder to isolate via script.)")
        return

    print(f"✅ Found Backend: PID {backend.pid} ({backend.name()})")
    print("=" * 65)
    print(f"{'Time':<10} | {'Backend CPU%':<15} | {'Backend RAM':<15} | {'Total System CPU%':<15}")
    print("-" * 65)

    try:
        while True:
            if not psutil.pid_exists(backend.pid):
                print("\n⚠️ Backend process ended.")
                break

            # Get process specific stats
            # First call to cpu_percent is 0.0, subsequent calls return avg since last call
            proc_cpu = backend.cpu_percent(interval=None)
            
            # Memory (Resident Set Size)
            mem_info = backend.memory_info()
            proc_mem_mb = mem_info.rss / (1024 * 1024)
            
            # System wide CPU
            sys_cpu = psutil.cpu_percent(interval=None)

            print(f"{time.strftime('%H:%M:%S'):<10} | {proc_cpu:<15.1f} | {proc_mem_mb:<15.1f} | {sys_cpu:<15.1f}")
            
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n🛑 Monitoring stopped.")
    except Exception as e:
        print(f"\nError: {e}")

if __name__ == "__main__":
    try:
        monitor()
    except ImportError:
        print("❌ Missing required library: psutil")
        print("   Please run: pip install psutil")
