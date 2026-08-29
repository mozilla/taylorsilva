import { resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();

const CREDENTIAL_PATTERNS: RegExp[] = [
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.gnupg(\/|$)/,
  /(^|\/)\.config\/gcloud(\/|$)/,
  /(^|\/)\.config\/sops(\/|$)/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
  /(^|\/)\.docker\/config\.json$/,
  /(^|\/)\.git-credentials$/,
  /(^|\/)\.kube\/config$/,
  /(^|\/)kubeconfig$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /\.keystore$/,
  /id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /(^|\/)credentials(\.json|\.yaml|\.yml|\.ini|\.toml)?$/i,
  /(^|\/)secrets?(\.json|\.yaml|\.yml|\.ini|\.toml|\.env)?$/i,
  /\.env(\.[a-z]+)?$/i,
  /token(\.json|\.txt|\.yaml|\.yml)?$/i,
  /\bauth\.json$/i,
];

const ENV_FILE_ALLOWLIST = new Set<string>([".env.example", ".env.sample"]);

export interface CredentialCheck {
  blocked: boolean;
  reason?: string;
}

export function checkCredentialPath(path: string): CredentialCheck {
  if (!path) return { blocked: false };
  const abs = isAbsolute(path) ? path : resolve(path);
  const base = abs.split("/").pop() ?? "";
  if (ENV_FILE_ALLOWLIST.has(base)) return { blocked: false };

  const matched = CREDENTIAL_PATTERNS.find((p) => p.test(abs));
  if (matched) {
    return {
      blocked: true,
      reason: `Refusing to read ${path} — matches credential pattern ${matched}. Mozilla AI policy: "Ensure agents don't have access to credentials, tokens, cookies, or otherwise authentication material."`,
    };
  }

  if (abs === HOME || abs.startsWith(`${HOME}/.config/`)) {
    return {
      blocked: true,
      reason: `Refusing to read ${path} — paths under ~/.config are likely to contain auth material. If you need a specific config file, ask the operator to provide its content.`,
    };
  }

  return { blocked: false };
}

export interface PreToolUseInput {
  tool_name: string;
  tool_input: unknown;
}

export interface HookOutput {
  decision?: "approve" | "block";
  reason?: string;
  continue?: boolean;
}

const READ_TOOLS = new Set(["Read", "NotebookRead"]);

export async function preToolUseHook(input: PreToolUseInput): Promise<HookOutput> {
  if (READ_TOOLS.has(input.tool_name)) {
    const ti = input.tool_input as { file_path?: string; notebook_path?: string };
    const path = ti?.file_path ?? ti?.notebook_path;
    if (typeof path === "string") {
      const check = checkCredentialPath(path);
      if (check.blocked) {
        return { decision: "block", reason: check.reason };
      }
    }
  }
  if (input.tool_name === "Bash") {
    const ti = input.tool_input as { command?: string };
    const cmd = ti?.command;
    if (typeof cmd === "string") {
      if (
        /(?:^|[\s|;&])(cat|head|tail|less|more|bat|xxd|strings|od)\s+\S*(?:\/\.aws\/|\/\.ssh\/|\.netrc|id_rsa|id_ed25519|\.pem|\.key|\.git-credentials|\.kube\/config|\.gnupg\/)/.test(
          cmd,
        )
      ) {
        return {
          decision: "block",
          reason: `Refusing to read credential material via shell. Command rejected: ${cmd}`,
        };
      }
      if (/\benv\b/.test(cmd) && !cmd.includes("|") && !/\benv\s+[A-Z_]+=/.test(cmd)) {
        return {
          decision: "block",
          reason: `Refusing bare 'env' (would dump environment variables that may contain tokens). Filter explicitly with grep -v.`,
        };
      }
    }
  }
  return {};
}
