// Checks the configured commit author against the project's required identity.
// Called by: the pre-commit Git hook after the staged privacy scan
import { execFileSync } from "node:child_process";

function matchesAuthor() {
  const options = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
  try {
    const name = execFileSync("git", ["config", "user.name"], options).trim();
    const email = execFileSync("git", ["config", "user.email"], options).trim();
    // Also check Git's effective identity so environment overrides cannot silently change it.
    const author = execFileSync("git", ["var", "GIT_AUTHOR_IDENT"], options).trim();
    return name === "Devin Deng" && email === "99384331+iamdevindeng@users.noreply.github.com"
      && author.startsWith(`${name} <${email}> `);
  } catch {
    return false;
  }
}

if (!matchesAuthor()) {
  console.error("Commit blocked: configure the required Devin Deng author identity (FIXES-R4 R12b).");
  process.exitCode = 1;
}
