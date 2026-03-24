const { spawn } = require("node:child_process");

delete process.env.ELECTRON_RUN_AS_NODE;

const electronBinary = require("electron");
const args = process.argv.slice(2);

const child = spawn(electronBinary, args, {
  stdio: "inherit",
  windowsHide: false,
  env: process.env
});

child.on("close", (code, signal) => {
  if (code === null) {
    console.error(`electron exited with signal ${signal}`);
    process.exit(1);
    return;
  }
  process.exit(code);
});
