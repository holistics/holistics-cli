#!/bin/bash

set -euo pipefail

# Detect the operating system and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture to the appropriate release name
case "$ARCH" in
    x86_64)
        ARCH_SUFFIX="x64"
        ;;
    arm64|aarch64)
        ARCH_SUFFIX="arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH" >&2
        exit 1
        ;;
esac

# Fetch the latest release version from GitHub API
LATEST_RELEASE=$(curl -s https://api.github.com/repos/holistics/holistics-cli/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

# Remove 'v' prefix if present
VERSION=$(echo "$LATEST_RELEASE" | sed 's/^v//')

# Construct download URL
DOWNLOAD_URL="https://github.com/holistics/holistics-cli/releases/download/${LATEST_RELEASE}/holistics-${VERSION}-${OS}-${ARCH_SUFFIX}"

# Determine installation directory (use ~/.holistics/bin)
INSTALL_DIR="${HOME}/.holistics/bin"

# Create installation directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Download the binary
echo "Downloading Holistics CLI ${VERSION} for ${OS} ${ARCH}..."
curl -L -o "$TEMP_DIR/holistics-cli" "$DOWNLOAD_URL"

# Make the binary executable
chmod +x "$TEMP_DIR/holistics-cli"

# Move to installation directory with new name
mv "$TEMP_DIR/holistics-cli" "${INSTALL_DIR}/holistics"

# Function to update shell configurations
update_shell_config() {
    local shell_type="$1"
    local config_file="$2"
    local path_entry="$3"

    # Check if the path entry is already in the config file
    if [ -f "$config_file" ] && ! grep -qF "$path_entry" "$config_file"; then
        echo "" >> "$config_file"
        echo "# Added by Holistics CLI installer" >> "$config_file"
        
        case "$shell_type" in
            bash|zsh)
                echo "$path_entry" >> "$config_file"
                ;;
            fish)
                echo "fish_add_path $INSTALL_DIR" >> "$config_file"
                ;;
        esac
        
        echo "Updated $shell_type configuration in $config_file"
    fi
}

# Detect and update shell configurations
SHELLS_TO_CHECK=(
    "bash:$HOME/.bashrc:export PATH=\"\$HOME/.holistics/bin:\$PATH\""
    "zsh:$HOME/.zshrc:export PATH=\"\$HOME/.holistics/bin:\$PATH\""
    "fish:$HOME/.config/fish/config.fish:set -gx PATH \$HOME/.holistics/bin \$PATH"
)

for shell_config in "${SHELLS_TO_CHECK[@]}"; do
    IFS=':' read -r shell config_path path_entry <<< "$shell_config"
    
    # Check if the shell is available and config file exists
    if command -v "$shell" >/dev/null 2>&1 && [ -f "$config_path" ]; then
        update_shell_config "$shell" "$config_path" "$path_entry"
    fi
done

# Verify installation
if [ -x "${INSTALL_DIR}/holistics" ]; then
    echo "Holistics CLI ${VERSION} successfully installed to ${INSTALL_DIR}/holistics"
    echo "Please restart your terminal or run 'source' on your shell's configuration file"
else
    echo "Installation failed" >&2
    exit 1
fi
