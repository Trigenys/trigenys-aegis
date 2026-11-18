# Runbook : OPNsense en machine virtuelle

OPNsense est un système complet (FreeBSD), pas un conteneur. Dans le labo il joue le **pare-feu
de la PME simulée** : le poste Windows de test est derrière lui, comme chez un vrai client, et ses
journaux partent vers Wazuh.

Version de référence : **OPNsense 26.7** (image `OPNsense-26.7-dvd-amd64.iso`, puis mise à jour
intégrée vers 26.7.x). Licence BSD-2-Clause, voir `LICENSES.md`.

## Topologie

```
                Internet
                   │ IP publique
        ┌──────────┴───────────────────────────────────────────┐
        │ Serveur dédié — Proxmox VE                           │
        │                                                      │
        │  vmbr0 : pont public (IP du serveur, SSH, MeshCentral)│
        │  vmbr1 : « WAN labo » 192.168.100.0/24, NAT par l'hôte│
        │     ├─ VM aegis-lab (Docker, compose.yaml) .10        │
        │     └─ OPNsense WAN .2                                │
        │  vmbr2 : « LAN PME » 10.10.10.0/24, sans accès direct │
        │     ├─ OPNsense LAN 10.10.10.1 (DHCP)                 │
        │     └─ VM Windows de test (DHCP)                      │
        └──────────────────────────────────────────────────────┘
```

Le poste Windows joint les services du labo (192.168.100.10) en sortant par OPNsense, exactement
comme un poste client joindrait les serveurs Trigenys.

## Ressources de la VM

| Élément | Valeur |
|---|---|
| vCPU | 2 |
| RAM | 2 Go (minimum documenté 1 Go ; 2 Go laissent la place aux plugins) |
| Disque | 20 Go, virtio, thin |
| Cartes réseau | 2 × virtio : `net0` → vmbr1 (WAN), `net1` → vmbr2 (LAN) |
| Type de machine | q35, BIOS OVMF ou SeaBIOS, type d'OS « other » |

## Étapes

### 1. Préparer les ponts sur l'hôte Proxmox

Dans `/etc/network/interfaces` de l'hôte (à adapter au nom de l'interface physique) :

```
auto vmbr1
iface vmbr1 inet static
    address 192.168.100.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up   iptables -t nat -A POSTROUTING -s 192.168.100.0/24 -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s 192.168.100.0/24 -o vmbr0 -j MASQUERADE

auto vmbr2
iface vmbr2 inet manual
    bridge-ports none
    bridge-stp off
    bridge-fd 0
```

Activer le routage (`net.ipv4.ip_forward=1` dans `/etc/sysctl.d/99-lab.conf`), puis `ifreload -a`.
`vmbr2` n'a volontairement aucune IP sur l'hôte : seul OPNsense y route.

### 2. Télécharger et vérifier l'image

Depuis un miroir officiel listé sur <https://opnsense.org/download/> :

```bash
cd /var/lib/vz/template/iso
wget https://pkg.opnsense.org/releases/26.7/OPNsense-26.7-dvd-amd64.iso.bz2
wget https://pkg.opnsense.org/releases/26.7/OPNsense-26.7-checksums-amd64.sha256
sha256sum -c --ignore-missing OPNsense-26.7-checksums-amd64.sha256
bunzip2 OPNsense-26.7-dvd-amd64.iso.bz2
```

Ne pas continuer si la somme de contrôle ne correspond pas.

### 3. Créer la VM

```bash
qm create 200 --name opnsense-lab --ostype other --machine q35 \
  --cores 2 --memory 2048 --balloon 0 \
  --scsihw virtio-scsi-single --scsi0 local-lvm:20 \
  --net0 virtio,bridge=vmbr1 --net1 virtio,bridge=vmbr2 \
  --cdrom local:iso/OPNsense-26.7-dvd-amd64.iso --boot order='scsi0;ide2' \
  --onboot 1
qm start 200
```

### 4. Installer

Dans la console Proxmox de la VM :

1. Se connecter en `installer` / `opnsense` (identifiants de l'installeur officiel).
2. Choisir l'installation UFS ou ZFS sur le disque `da0`, définir un mot de passe root fort
   (le ranger dans le coffre de mots de passe, jamais dans le dépôt).
3. Retirer l'ISO (`qm set 200 --delete ide2`) et redémarrer.

### 5. Affecter les interfaces (console)

- Option 1 « Assign interfaces » : WAN = `vtnet0`, LAN = `vtnet1`.
- Option 2 « Set interface IP address » :
  - WAN : statique `192.168.100.2/24`, passerelle `192.168.100.1` ;
  - LAN : `10.10.10.1/24`, serveur DHCP activé de `10.10.10.100` à `10.10.10.200`.

### 6. Configurer depuis l'interface web

L'interface web écoute sur le LAN. Y accéder par un tunnel SSH via l'hôte, ou depuis la VM Windows
(`https://10.10.10.1`).

1. Assistant initial : nom `opnsense-lab`, DNS `9.9.9.9` et `1.1.1.1`, fuseau horaire.
2. **Système › Firmware › Mises à jour** : appliquer les mises à jour 26.7.x.
3. **Pare-feu › Règles › LAN** : garder « LAN vers tout » pour le labo, puis ajouter une règle de
   blocage visible pour la démo (par exemple bloquer `tcp/23` sortant, journalisée).
4. **Système › Paramètres › Journalisation › Distant** : ajouter une destination
   - transport UDP(4), application « filterlog » et « audit » ;
   - hôte `192.168.100.10`, port `514` (port syslog du manager Wazuh).
5. **Services › Intrusion Detection** (facultatif) : activer Suricata sur le WAN avec les règles
   ET Open pour montrer des alertes réseau dans Wazuh.

### 7. Vérifier

- Depuis la VM Windows : `ping 10.10.10.1`, puis accès à `https://192.168.100.10:8443` (Wazuh, si
  `CONSOLE_BIND=0.0.0.0` dans le labo) ou à MeshCentral.
- Dans Wazuh : **Threat Hunting**, filtrer `predecoder.program_name: filterlog` ; les blocages de
  la règle de démo doivent apparaître en moins d'une minute.

## Sauvegarde et démontage

- Sauvegarde de configuration : **Système › Configuration › Sauvegardes › Télécharger** (fichier
  XML, à chiffrer si conservé).
- Démontage : `qm stop 200 && qm destroy 200 --purge`. Retirer `vmbr1`/`vmbr2` de
  `/etc/network/interfaces` si le serveur change d'usage.

## Variante sans Proxmox

Sur un hôte Linux avec KVM, la même VM se crée avec `virt-install` (2 ponts libvirt : un réseau NAT
pour le WAN, un réseau isolé pour le LAN). Les étapes 4 à 7 sont identiques. Sur un serveur cloud
sans virtualisation imbriquée, OPNsense ne peut pas tourner : utiliser un serveur dédié.
