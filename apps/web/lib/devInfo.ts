import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { localOutputs } from "./localOutputs.ts";
import { localRequest } from "./personalFit.ts";

/** What the development badge shows: the checkout's branch and the data folder this server reads and writes. */
export type DevInfo = { branch: string; commit: string; data: { path: string; override: boolean } };

/** Runs git with these arguments in the app's checkout and resolves with its trimmed standard output. */
export type GitRun = (args: string[]) => Promise<string>;

const gitRun: GitRun = args => new Promise((resolve, reject) => execFile("git", args, { cwd: process.cwd(), timeout: 5_000, windowsHide: true },
  (error, stdout) => error ? reject(error) : resolve(stdout.trim())));

/**
 * Development and localhost only: GET returns the branch (or "detached" for a detached checkout) and commit of the checkout
 * this server runs from, read on every request so a checkout switch shows at once, and the resolved data folder: the
 * repository's outputs/ or LOCAL_WARDROBE_OUTPUTS_DIR (override: true).
 */
export function createDevInfoHandler(environment = process.env.NODE_ENV, outputs = localOutputs(), override = !!process.env.LOCAL_WARDROBE_OUTPUTS_DIR, git: GitRun = gitRun) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (environment !== "development" || !localRequest(req) || req.method !== "GET") return res.status(404).end();
    const [branch, commit] = await Promise.all([git(["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "unknown"), git(["rev-parse", "--short", "HEAD"]).catch(() => "")]);
    const resolved = await realpath(outputs).catch(() => path.resolve(outputs));
    const info: DevInfo = { branch: branch === "HEAD" ? "detached" : branch, commit, data: { path: resolved, override } };
    return res.status(200).json(info);
  };
}
