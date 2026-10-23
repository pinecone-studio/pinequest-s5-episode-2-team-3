# Live view of the base in the terminal: weight from the USB port every second, the drinks and
# refills it counts, and what the server last received from it. `bun run monitor [port]`, Ctrl+C stops.
# `bun run monitor --demo`: for showing it by hand. Press the load cell and let go; when the average of the
# last 4 readings falls 100 g or more from its peak and holds still, the drop is sent as a base-01 drink
# through /api/events, so the web/app adds it to today's goal. (Uncalibrated, so the amount is the raw drop.)
# Plain Python (no pyserial). It keeps DTR up while reading and drops it on exit: the firmware's USB
# serial blocks on writes while a host holds DTR without reading, which stalls uploads.
import fcntl, glob, json, os, re, struct, sys, termios, time, urllib.request

API = os.environ.get('API_URL', 'https://dusal-api.bbek3201.workers.dev')
demo = '--demo' in sys.argv
ports = [a for a in sys.argv[1:] if not a.startswith('--')] or sorted(glob.glob('/dev/cu.usbmodem*') + glob.glob('/dev/ttyACM*'))
if not ports: sys.exit('Suuri USB-eer zalgagdaagui baina (/dev/cu.usbmodem* oldsongui).')
fd = os.open(ports[0], os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
a = termios.tcgetattr(fd)
a[4] = a[5] = termios.B115200
a[2] = (a[2] | termios.CLOCAL | termios.CREAD) & ~termios.HUPCL
a[3] = 0
termios.tcsetattr(fd, termios.TCSANOW, a)
lines = lambda on, bits: fcntl.ioctl(fd, termios.TIOCMBIS if on else termios.TIOCMBIC, struct.pack('I', bits))
lines(False, termios.TIOCM_RTS)
lines(True, termios.TIOCM_DTR)

PHASE = {'0': 'hodolj baina', '1': 'hooson (sav alga)', '2': 'sav baina'}
def server() -> str:
    try:
        req = urllib.request.Request(f'{API}/api/devices', headers={'User-Agent': 'dusal-monitor'})
        r = json.load(urllib.request.urlopen(req, timeout=5))[0]['reading']
        left = f"{r['remainingMl']} ml" if r['stable'] else '?'
        return f"server: {r['id']} · uldegdel {left} · {r['at'][11:19]} UTC"
    except Exception as error:
        return f'server: holbogdsongui ({error})'

DEMO_MIN_G, DEMO_STILL_G = 100, 15
def send_drink(amount: int) -> str:
    at = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
    body = json.dumps({'id': f'base-01-demo-{int(time.time() * 1000)}', 'amount': amount, 'type': 'drink', 'at': at, 'deviceId': 'base-01'}).encode()
    req = urllib.request.Request(f'{API}/api/events', body, {'Content-Type': 'application/json', 'User-Agent': 'dusal-monitor'})
    try: return f'server bichlee ({urllib.request.urlopen(req, timeout=8).status})'
    except Exception as error: return f'server ruu ilgeej chadsangui ({error})'

print(f'{ports[0]} · Ctrl+C = zogsooh' + (f' · DEMO: daraad tavihad {DEMO_MIN_G} g-aas ih buuraltiig uulaa gej toolno' if demo else '') + '\n')
buf, ask, poll, left = b'', 0.0, 0.0, '?'
recent = []
peak = None
shown = 0.0
try:
    while True:
        now = time.time()
        if now > ask: os.write(fd, b'status\n'); ask = now + (0.25 if demo else 1)
        if now > poll: print(f'{time.strftime("%H:%M:%S")}  {server()}', flush=True); poll = now + 15
        try: buf += os.read(fd, 4096)
        except BlockingIOError: time.sleep(0.05); continue
        while b'\n' in buf:
            raw, buf = buf.split(b'\n', 1)
            line, t = raw.decode(errors='replace').strip(), time.strftime('%H:%M:%S')
            if m := re.search(r'remaining (-?\d+) ml', line): left = '?' if m[1] == '-1' else f'{m[1]} ml'
            elif m := re.search(r'now ([-\d.]+) g \| settled (-?\d+) g \| phase (\d)', line):
                if demo:
                    recent = (recent + [float(m[1])])[-4:]
                    if len(recent) < 4: continue
                    level, still = sum(recent) / 4, max(recent) - min(recent) < DEMO_STILL_G
                    peak = level if peak is None else max(peak, level)
                    if still and peak - level >= DEMO_MIN_G:
                        amount = round(peak - level)
                        print(f'{t}  >>> UULAA {amount} ml (dundaj {peak:.0f} -> {level:.0f} g) · {send_drink(amount)}', flush=True)
                        peak = level
                    elif still: peak = level
                    if now - shown >= 1: print(f'{t}  jin {float(m[1]):7.1f} g | 4 hemjiltiin dundaj {level:7.1f} g', flush=True); shown = now
                    continue
                print(f'{t}  jin {float(m[1]):7.1f} g | togtvorjson {m[2]:>5} g | uldegdel {left:>7} | {PHASE.get(m[3], m[3])}', flush=True)
            elif line and not line.startswith(('status upload', 'boot ', 'commands:')):
                print(f'{t}  >>> {line}', flush=True)
except KeyboardInterrupt:
    print('\nzogsloo')
finally:
    lines(False, termios.TIOCM_DTR)
    os.close(fd)
