import { readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function readAliasConfig(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function saveAliasConfig(path: string, expected: string | null, config: unknown): Promise<string | null> {
  const lock = await open(`${path}.lock`, "wx", 0o600).catch(() => { throw new Error("配置被其他进程锁定；请稍后重试。若进程异常退出，请核查对应 .lock 文件。"); });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    if (await readAliasConfig(path) !== expected) throw new Error("配置已被其他会话修改。请关闭面板并重新打开，避免覆盖。");
    const backup = expected === null ? null : `${path}.bak-${Date.now()}-${randomUUID().slice(0, 8)}`;
    if (backup) await writeFile(backup, expected!, { flag: "wx", mode: 0o600 });
    await writeFile(temporary, JSON.stringify(config, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
    return backup;
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(`${path}.lock`);
  }
}
