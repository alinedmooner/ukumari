#!/usr/bin/env node
// build/build-manifests.js
// Genera manifest.json (Chrome MV3) y manifest-firefox.json (Firefox MV2)
// desde build/manifest.base.json. Mantiene una sola fuente de verdad para
// nombre, permisos, scripts y CSS.
//
// Uso: node build/build-manifests.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const base = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'manifest.base.json'), 'utf8')
);

function buildChrome(b) {
  return {
    manifest_version: 3,
    name: b.name,
    description: b.description,
    version: b.version,
    default_locale: b.default_locale,
    icons: b.icons,
    permissions: b.permissions,
    host_permissions: b.host_permissions,
    action: {
      default_popup: b.popup,
      default_icon: b.icons
    },
    background: { service_worker: b.background_script },
    content_scripts: b.content_scripts,
    options_page: b.options_page,
    web_accessible_resources: [
      { resources: b.web_accessible_resources, matches: ['<all_urls>'] }
    ]
  };
}

function buildFirefox(b) {
  return {
    manifest_version: 2,
    name: b.name,
    description: b.description,
    version: b.version,
    default_locale: b.default_locale,
    icons: b.icons,
    permissions: [...b.permissions, ...b.host_permissions],
    background: { scripts: [b.background_script] },
    browser_action: {
      default_popup: b.popup,
      default_icon: b.icons
    },
    content_scripts: b.content_scripts,
    options_ui: { page: b.options_page, open_in_tab: true },
    web_accessible_resources: b.web_accessible_resources,
    applications: {
      gecko: {
        id: b.firefox_id,
        strict_min_version: b.firefox_strict_min_version
      }
    }
  };
}

function write(filename, value) {
  const target = path.join(ROOT, filename);
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
  console.log(`✓ ${filename}`);
}

write('manifest.json', buildChrome(base));
write('manifest-firefox.json', buildFirefox(base));
