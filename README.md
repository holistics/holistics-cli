# Holistics CLI

The Holistics CLI tool provides a convenient command-line interface for interacting with Holistics services. This tool allows developers and analysts to streamline workflows by integrating Holistics capabilities directly into their development environment and automation pipelines.

## Installation

**Note**: If you're using MacOS 12x (Monterey), please see the section [How to run the code via Node](#how-to-run-the-code-via-node)

```bash
curl -fsSL https://raw.githubusercontent.com/holistics/holistics-cli/refs/heads/master/install.sh | bash
```


## Usage

Please refer to the [Holistics CLI Documentation](https://docs.holistics.io/docs/cli/) for more information.

## Development
The Holistics CLI is built as a lightweight NodeJS wrapper around the `@holistics/cli-core` package, which contains the core functionality. The wrapper has two main responsibilities:

1. Package Management
   - On startup, it automatically downloads the latest version of `@holistics/cli-core` from the npm registry
   - The package is cached locally in `.cache/holistics` for future use

2. Command Execution 
   - Once the core package is loaded, it invokes the `@holistics/cli-core` for the actual command execution
   - This enables commands like:
     - `auth`: Authentication and user management
     - `dbt`: dbt project operations
     - `aml`: Analytics Modeling Language features

## Release process
- The cli-app is bundled via bun 1.2.10. Executable files are in the Releases section.
- It is possible to check out the code and run it via Node (see below)

## How to run the code via Node
You need to have NodeJS installed on your machine (version v18 or higher)

**Check out the code and install dependencies**
```bash
git clone https://github.com/holistics/holistics-cli.git
cd holistics-cli
npm i
```

**Run the CLI**
```bash
npm run cli --help
```

