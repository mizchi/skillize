import * as fs from "node:fs/promises";
import * as path from "node:path";

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function packageSkill(skillDir: string, outputDir?: string): Promise<string | null> {
  try {
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) {
      console.error(`Error: Not a directory: ${skillDir}`);
      return null;
    }
  } catch {
    console.error(`Error: Directory not found: ${skillDir}`);
    return null;
  }

  const resolvedSkillDir = path.resolve(skillDir);
  const skillName = path.basename(resolvedSkillDir);
  const resolvedOutputDir = path.resolve(outputDir || path.dirname(resolvedSkillDir));
  const outputFilename = path.join(resolvedOutputDir, skillName);

  // Ensure output directory exists
  await fs.mkdir(resolvedOutputDir, { recursive: true });

  console.log(`Packaging ${skillDir} to ${outputFilename}.skill...`);

  try {
    const zipPath = `${outputFilename}.zip`;
    if (await exists(zipPath)) await fs.rm(zipPath);

    const command = new Deno.Command("zip", {
      args: ["-r", "-q", zipPath, "."],
      cwd: resolvedSkillDir,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();
    if (code !== 0) {
      console.error(`zip command failed: ${new TextDecoder().decode(stderr)}`);
      return null;
    }

    const finalPath = `${outputFilename}.skill`;
    if (await exists(finalPath)) await fs.rm(finalPath);

    await fs.rename(zipPath, finalPath);
    console.log(`Successfully created: ${finalPath}`);
    return finalPath;
  } catch (e) {
    console.error(`Error packaging skill: ${e}`);
    return null;
  }
}

if (import.meta.main) {
  const skillDir = Deno.args[0];
  if (!skillDir) {
    console.log("Usage: deno run --allow-read --allow-write --allow-run package_skill.ts <skill_dir> [--output <dir>]");
    Deno.exit(1);
  }
  const outputIdx = Deno.args.indexOf("--output");
  const output = outputIdx !== -1 ? Deno.args[outputIdx + 1] : undefined;
  if (!(await packageSkill(skillDir, output))) Deno.exit(1);
}
