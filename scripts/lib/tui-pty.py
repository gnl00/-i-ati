"""JSON-lines bridge between the TUI acceptance runner and a real POSIX PTY."""
import base64
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios

master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 100, 0, 0))
child = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave,
                         start_new_session=True, env={**os.environ, 'TERM': 'xterm-256color'})
os.close(slave)
buffer = b''
try:
    while True:
        ready, _, _ = select.select([master, sys.stdin], [], [], 0.1)
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            print(json.dumps({'data': base64.b64encode(data).decode()}), flush=True)
        if sys.stdin in ready:
            data = os.read(sys.stdin.fileno(), 65536)
            if not data:
                child.terminate()
                break
            buffer += data
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                command = json.loads(line)
                if 'write' in command:
                    os.write(master, command['write'].encode())
                if 'resize' in command:
                    rows, cols = command['resize']
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
                    # The child starts a new session without a controlling terminal.
                    os.killpg(child.pid, signal.SIGWINCH)
                if command.get('signal'):
                    os.killpg(child.pid, getattr(signal, command['signal']))
        if child.poll() is not None and not ready:
            break
finally:
    os.close(master)
    try:
        code = child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        child.kill()
        code = child.wait()
    print(json.dumps({'exit': code}), flush=True)
