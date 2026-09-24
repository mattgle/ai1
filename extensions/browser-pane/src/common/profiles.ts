export interface Profile {
  id: string;
  name: string;
}

export const DEFAULT_PROFILE_ID = "default";
export const AGENT_PROFILE_ID = "agent";

export const INITIAL_PROFILES: Profile[] = [
  { id: DEFAULT_PROFILE_ID, name: "Default" },
  { id: AGENT_PROFILE_ID, name: "Agent" },
];

const PARTITION_PREFIX = "persist:ai1-browser-";
const PROFILE_ID = /^[a-z0-9-]{1,40}$/;
const MAX_NAME_LENGTH = 40;

// Each profile is one Electron session partition. `persist:` keeps its
// cookies and storage on disk.
export function partitionFor(id: string): string {
  return `${PARTITION_PREFIX}${id}`;
}

export function profileIdFromPartition(partition: string): string | undefined {
  if (!partition.startsWith(PARTITION_PREFIX)) {
    return undefined;
  }
  const id = partition.slice(PARTITION_PREFIX.length);
  return PROFILE_ID.test(id) ? id : undefined;
}

// `random` gives 8 lowercase hex characters. It is a parameter so a test can
// control it.
export function newProfileId(existing: string[], random: () => string): string {
  for (;;) {
    const id = `p-${random()}`;
    if (!existing.includes(id)) {
      return id;
    }
  }
}

export function validateProfileName(
  name: string,
  profiles: Profile[],
  exceptId?: string,
): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Type a name for the profile.";
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `A profile name has at most ${MAX_NAME_LENGTH} characters.`;
  }
  const lower = trimmed.toLowerCase();
  if (profiles.some((profile) => profile.id !== exceptId && profile.name.toLowerCase() === lower)) {
    return `A profile with the name "${trimmed}" exists.`;
  }
  return undefined;
}
