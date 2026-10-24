/**
 * Load the public installation identity before mounting any visible UI.
 * If configuration loading fails, mount with the safe built-in defaults.
 */
export async function mountAfterConfiguration(
  loadConfiguration: () => Promise<void>,
  mount: () => void,
): Promise<void> {
  try {
    await loadConfiguration()
  } catch {
    // An inaccessible configuration endpoint must not leave the SPA blank.
  }
  mount()
}
