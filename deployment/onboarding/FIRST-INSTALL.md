# First deployment: shopping.paulhiggins.cloud

This is a one-time installation kit. The regular `shoppinglist-release-*` archive contains only this app; shared gateway additions live separately under `onboarding/`. The app has a Caddy web container, Node API container and persistent SQLite volume. It does not use PHP/MySQL or publish another public web port.

No VPS, DNS, SSH or gateway settings were changed while preparing this kit. Its gateway paths/service name follow the existing documented server layout; confirm they match the live server before editing. Do not rerun VPS bootstrap or any Stillkey/MyClinicHelper deployment.

## 1. DNS and upload

Create an A record for `shopping.paulhiggins.cloud` pointing to the VPS public IPv4 address. Only publish an AAAA record if this VPS already has working public IPv6 and HTTPS connectivity. Existing gateway ports 80/443 must remain reachable.

On the workstation, copy the kit and its checksum (replace SERVER_IP):

```bash
cd ~/shopping-list
scp deployment/out/shopping-first-install-__RELEASE__.tar.gz deployment/out/shopping-first-install-__RELEASE__.tar.gz.sha256 paul@SERVER_IP:~/
```

SSH into the VPS, then:

```bash
cd ~
sha256sum -c shopping-first-install-__RELEASE__.tar.gz.sha256
```

Proceed only after **OK**:

```bash
mkdir ~/shopping-first-install-__RELEASE__
tar -xzf shopping-first-install-__RELEASE__.tar.gz -C ~/shopping-first-install-__RELEASE__
sudo bash ~/shopping-first-install-__RELEASE__/setup/deploy.sh --install https://shopping.paulhiggins.cloud
```

The app starts privately on its own networks. `/srv/stacks/shoppinglist/.env` records the exact allowed public origin; do not add a trailing slash. Your local development database and browser lists are not in the kit. Use the app's backup import later if you want the old shopping data.

## 2. Back up the existing shared gateway

```bash
sudo test -f /srv/stacks/gateway/compose.yaml
sudo test -f /srv/stacks/gateway/Caddyfile
sudo test -f /srv/stacks/.env
sudo cp -a /srv/stacks/gateway /srv/stacks/gateway.before-shopping-__RELEASE__
```

If the live stack has a different path or service name, adapt these commands after inspecting it. This backup does not replace the need to retain the gateway's Docker certificate volumes; none of the commands below removes them.

## 3. Attach only the new app network

First ensure there is no existing file by this name:

```bash
sudo test ! -e /srv/stacks/gateway/shopping.compose.yaml
```

If that test fails, inspect the existing file instead of overwriting it. Otherwise:

```bash
sudo install -m 0644 ~/shopping-first-install-__RELEASE__/onboarding/shopping.compose.yaml /srv/stacks/gateway/shopping.compose.yaml
sudo docker compose -p gateway --env-file /srv/stacks/.env -f /srv/stacks/gateway/compose.yaml -f /srv/stacks/gateway/shopping.compose.yaml config --quiet
```

This additive Compose file preserves the gateway's other networks, routes, ports and certificate volumes. Keep using **both** `-f` files for future gateway operations; omitting the shopping file can disconnect the new app. A later infrastructure cleanup may merge the network addition into the main Compose file, but it is not necessary for this deployment.

## 4. Add the domain route and validate

Display the new route:

```bash
cat ~/shopping-first-install-__RELEASE__/onboarding/shopping.Caddyfile
sudo nano /srv/stacks/gateway/Caddyfile
```

Add the displayed `shopping.paulhiggins.cloud` block alongside the existing domain blocks, once. Keep the current global options, email and other sites. Do not replace the file with the snippet.

Because the gateway mounts its configuration directory, validate the edited file using its current running Caddy:

```bash
sudo docker compose -p gateway --env-file /srv/stacks/.env -f /srv/stacks/gateway/compose.yaml -f /srv/stacks/gateway/shopping.compose.yaml exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

If validation fails, fix the file or restore the backup before continuing. No Caddy reload has been requested by that validation command.

## 5. Apply the gateway network/route together

```bash
sudo docker compose -p gateway --env-file /srv/stacks/.env -f /srv/stacks/gateway/compose.yaml -f /srv/stacks/gateway/shopping.compose.yaml up -d --wait --wait-timeout 120 caddy
bash ~/shopping-first-install-__RELEASE__/setup/verify.sh
```

The new network attachment normally recreates the gateway container, causing a short interruption for all sites. Existing certificate volumes are reused. No `down -v` command is needed.

Open `https://shopping.paulhiggins.cloud/`, create a synthetic list and open its sharing link on a second device. Check edits in both directions, page reveal, installation, offline reopen/reconnect, backup and import. Also check `https://stillkey.paulhiggins.cloud/`, `https://myclinichelper.com/` and `https://www.myclinichelper.com/` still work. HTTPS now enables the PWA features that could not be tested reliably on LAN HTTP.

If HTTPS verification fails, inspect DNS and gateway logs:

```bash
sudo docker compose -p gateway --env-file /srv/stacks/.env -f /srv/stacks/gateway/compose.yaml -f /srv/stacks/gateway/shopping.compose.yaml logs --tail 100 caddy
sudo docker compose -p shoppinglist --env-file /srv/stacks/shoppinglist/.env -f /srv/stacks/shoppinglist/compose.yaml logs --tail 100
```

## Gateway rollback if needed

Restore the two original gateway files from the backup, then recreate the gateway using only its original Compose file. The app's database remains untouched:

```bash
sudo cp -a /srv/stacks/gateway.before-shopping-__RELEASE__/Caddyfile /srv/stacks/gateway/Caddyfile
sudo cp -a /srv/stacks/gateway.before-shopping-__RELEASE__/compose.yaml /srv/stacks/gateway/compose.yaml
sudo docker compose -p gateway --env-file /srv/stacks/.env -f /srv/stacks/gateway/compose.yaml up -d --wait --wait-timeout 120 caddy
```

The unused shopping override file may be left for investigation. Do not include it in rollback commands. Do not delete certificate or application data volumes.

## Later app updates

Build/upload a fresh **shoppinglist-release** package and run its `setup/deploy.sh` without `--install`. Leave the shared gateway alone. The one-time kit is not needed again. Retain previous app images and snapshots for rollback; the app updater does not automatically restore old database contents. Backup instructions are included at `docs/BACKUPS.md` in the kit.
