# Holistics CLI

The Holistics CLI tool provides a convenient command-line interface for interacting with Holistics services. This tool allows developers and analysts to streamline workflows by integrating Holistics capabilities directly into their development environment and automation pipelines.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/holistics/holistics-cli/refs/heads/master/install.sh | bash
```

## Usage

Please refer to the [Holistics CLI Documentation](https://docs.holistics.io/docs/cli/) for more information.

## Development
- The cli-app is a NodeJS app that wraps around @holistics/cli-core package
- Its main responsibilities is to automatically download the latest version of the @holistics/cli-core - which contains the core logic of the CLI
  - On initialization, it will download the built files of @holistics/cli-core from npm registry, store it in the `.cache/holistics`
  - Then it execute the @holistics/cli-core logic which then handles commands like: auth, dbt, aml

## Deployment
- The cli-app is bundled via bun 1.2.10. Executable files are in the Releases section.
- It is possible to check out the code and run it locally using Node (see below)

## How to run the code via Node

**Installation**
```bash
git clone https://github.com/holistics/holistics-cli.git
cd holistics-cli
npm i
```

**Run the CLI**
```bash
npm run cli --help
```

