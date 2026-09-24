import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AGENT_PROFILE_ID,
  DEFAULT_PROFILE_ID,
  INITIAL_PROFILES,
  newProfileId,
  partitionFor,
  Profile,
  profileIdFromPartition,
  validateProfileName,
} from "../common/profiles";

// The list of browser profiles, kept in one JSON file in Electron's user data
// folder. It has no `electron` import, so plain mocha tests it.
export class ProfileStore {
  protected profiles: Profile[] = [];

  constructor(
    protected readonly filePath: string,
    protected readonly clearPartition: (partition: string) => Promise<void>,
    protected readonly random: () => string = () => randomBytes(4).toString("hex"),
  ) {}

  load(): void {
    let stored: Profile[] = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as { profiles?: unknown };
      if (Array.isArray(parsed.profiles)) {
        stored = parsed.profiles.filter(isValidProfile);
      }
    } catch {
      stored = [];
    }
    const missing = INITIAL_PROFILES.filter(
      (initial) => !stored.some((profile) => profile.id === initial.id),
    );
    const initialFirst = [
      ...INITIAL_PROFILES.map((initial) => stored.find((profile) => profile.id === initial.id) ?? initial),
      ...stored.filter((profile) => !INITIAL_PROFILES.some((initial) => initial.id === profile.id)),
    ];
    this.profiles = initialFirst.map((profile) => ({ ...profile }));
    if (missing.length > 0) {
      this.save();
    }
  }

  list(): Profile[] {
    return this.profiles.map((profile) => ({ ...profile }));
  }

  has(id: string): boolean {
    return this.profiles.some((profile) => profile.id === id);
  }

  add(name: string): Profile {
    const problem = validateProfileName(name, this.profiles);
    if (problem) {
      throw new Error(problem);
    }
    const profile = {
      id: newProfileId(
        this.profiles.map((existing) => existing.id),
        this.random,
      ),
      name: name.trim(),
    };
    this.profiles.push(profile);
    this.save();
    return { ...profile };
  }

  rename(id: string, name: string): void {
    const profile = this.find(id);
    const problem = validateProfileName(name, this.profiles, id);
    if (problem) {
      throw new Error(problem);
    }
    profile.name = name.trim();
    this.save();
  }

  async delete(id: string): Promise<void> {
    if (id === DEFAULT_PROFILE_ID || id === AGENT_PROFILE_ID) {
      throw new Error("The Default and Agent profiles cannot be deleted.");
    }
    this.find(id);
    this.profiles = this.profiles.filter((profile) => profile.id !== id);
    this.save();
    await this.clearPartition(partitionFor(id));
  }

  protected find(id: string): Profile {
    const profile = this.profiles.find((candidate) => candidate.id === id);
    if (!profile) {
      throw new Error(`There is no profile with the id ${id}.`);
    }
    return profile;
  }

  // Writes a temporary file and renames it, so a crash cannot leave half a
  // file.
  protected save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ profiles: this.profiles }, undefined, 2));
    fs.renameSync(temporary, this.filePath);
  }
}

function isValidProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { id?: unknown; name?: unknown };
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    candidate.name.trim() !== "" &&
    profileIdFromPartition(partitionFor(candidate.id)) === candidate.id
  );
}
