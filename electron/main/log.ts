export function log(message: string): void {
  process.stderr.write(`[tinydiff] ${message}\n`);
}
