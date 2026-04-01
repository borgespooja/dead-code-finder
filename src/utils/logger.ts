import chalk from "chalk";

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
  success(msg: string): void;
}

export function createLogger(opts: { verbose?: boolean; quiet?: boolean } = {}): Logger {
  const verbose = !!opts.verbose;
  const quiet = !!opts.quiet;
  return {
    info(msg) {
      if (!quiet) process.stderr.write(`${chalk.cyan("ℹ")} ${msg}\n`);
    },
    warn(msg) {
      if (!quiet) process.stderr.write(`${chalk.yellow("⚠")} ${msg}\n`);
    },
    error(msg) {
      process.stderr.write(`${chalk.red("✖")} ${msg}\n`);
    },
    debug(msg) {
      if (verbose) process.stderr.write(`${chalk.gray("·")} ${chalk.gray(msg)}\n`);
    },
    success(msg) {
      if (!quiet) process.stderr.write(`${chalk.green("✓")} ${msg}\n`);
    },
  };
}
