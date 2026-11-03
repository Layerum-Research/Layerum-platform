export function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

export function formatTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [line(headers), ...rows.map(line)].join("\n");
}

export function printTable(headers: string[], rows: string[][]) {
  console.log(formatTable(headers, rows));
}
