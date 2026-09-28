#!/bin/bash

if type update-alternatives >/dev/null 2>&1; then
    if [ -L '/usr/bin/${executable}' ] && [ -e '/usr/bin/${executable}' ] && [ "$(readlink '/usr/bin/${executable}')" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

chmod "$(sh '/opt/${sanitizedProductName}/resources/sandbox-helper-mode.sh' /proc)" '/opt/${sanitizedProductName}/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

if apparmor_status --enabled > /dev/null 2>&1; then
    APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
    APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
    if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
        cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
        if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
            apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
        fi
    else
        echo "Skipping the AppArmor profile: this version of AppArmor does not support the bundled profile"
    fi
fi
