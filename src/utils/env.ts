// Extended env for spawning git - includes homebrew paths for macOS GUI apps
export const gitEnv = {
  ...process.env,
  PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`
};
