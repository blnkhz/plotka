import { SerialPort } from 'serialport';
import { DriverError, type Transport } from '@plotter-studio/plotter';
import type { PortInfo } from '@shared/ipc';

/** EiBotBoard USB IDs (docs/hardware-notes.md). */
const EBB_VID = '04d8';
const EBB_PID = 'fd92';

/** Serial ports, plotters first. On macOS the callout device (/dev/cu.*) is used. */
export async function listPorts(): Promise<PortInfo[]> {
  const ports = await SerialPort.list();
  return ports
    .filter((p) => !/Bluetooth|debug-console/i.test(p.path))
    .map((p) => {
      const path = process.platform === 'darwin' ? p.path.replace('/dev/tty.', '/dev/cu.') : p.path;
      const isPlotter =
        (p.vendorId?.toLowerCase() === EBB_VID && p.productId?.toLowerCase() === EBB_PID) ||
        /EiBotBoard|SchmalzHaus/i.test(`${p.manufacturer ?? ''} ${p.pnpId ?? ''}`);
      const name = p.serialNumber && p.serialNumber !== '0' ? ` “${p.serialNumber}”` : '';
      return { path, label: isPlotter ? `EBB plotter${name}` : path, isPlotter };
    })
    .sort((a, b) => Number(b.isPlotter) - Number(a.isPlotter));
}

/** Opens a serial port as a Transport for the EBB driver. */
export async function openSerial(path: string): Promise<Transport> {
  const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
  await new Promise<void>((resolve, reject) =>
    port.open((err) => {
      if (!err) return resolve();
      const msg = String(err.message);
      if (/busy|lock|access denied|permission/i.test(msg))
        reject(
          new DriverError(
            'port-busy',
            'The plotter is in use by another program (for example the AxiDraw software or Inkscape). Close it and try again.',
          ),
        );
      else reject(new DriverError('not-connected', `Couldn't open ${path}: ${msg}`));
    }),
  );
  await new Promise<void>((resolve) => port.flush(() => resolve()));
  return {
    write: (data) =>
      new Promise((resolve, reject) =>
        port.write(data, 'latin1', (err) =>
          err ? reject(err) : port.drain((e) => (e ? reject(e) : resolve())),
        ),
      ),
    onData: (listener) => port.on('data', (buf: Buffer) => listener(buf.toString('latin1'))),
    onClose: (listener) => port.on('close', (err?: Error) => listener(err)),
    close: () =>
      new Promise((resolve) => {
        if (!port.isOpen) return resolve();
        port.close(() => resolve());
      }),
  };
}
