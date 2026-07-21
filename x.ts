import { execSync } from 'node:child_process';

interface MikrotikActiveSession {
  '.id': string;
  name: string;
  address: string;
  uptime: string;
}

function parseAccelUptimeToMikrotik(accelUptime: string): string {
  let days = 0;
  let timeStr = accelUptime.trim();

  if (timeStr.includes('.')) {
    const [dStr, rest] = timeStr.split('.');
    days = parseInt(dStr, 10) || 0;
    timeStr = rest;
  }

  const parts = timeStr.split(':').map((p) => parseInt(p, 10) || 0);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const seconds = parts[2] ?? 0;

  const weeks = Math.floor(days / 7);
  const remDays = days % 7;

  const partsList: string[] = [];
  if (weeks > 0) partsList.push(`${weeks}w`);
  if (remDays > 0) partsList.push(`${remDays}d`);
  if (hours > 0) partsList.push(`${hours}h`);
  if (minutes > 0) partsList.push(`${minutes}m`);
  if (seconds > 0 || partsList.length === 0) partsList.push(`${seconds}s`);

  return partsList.join('');
}

function getActiveSessionsJson(): MikrotikActiveSession[] {
  try {
    const rawOutput = execSync(
      'accel-cmd show sessions ifname,username,ip,uptime',
      { encoding: 'utf-8' }
    );

    const lines = rawOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('-') && !line.includes('username'));

    const sessions: MikrotikActiveSession[] = [];

    for (const line of lines) {
      const cols = line.split('|').map((col) => col.trim());
      if (cols.length >= 4) {
        const [ifname, username, ip, rawUptime] = cols;

        sessions.push({
          '.id': ifname,
          name: username,
          address: ip,
          uptime: parseAccelUptimeToMikrotik(rawUptime),
        });
      }
    }

    return sessions;
  } catch (error) {
    console.error('Error executing accel-cmd:', error);
    return [];
  }
}

// Eksekusi dan cetak JSON
const result = getActiveSessionsJson();
console.log(JSON.stringify(result, null, 2));
