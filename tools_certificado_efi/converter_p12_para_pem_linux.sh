#!/usr/bin/env bash
set -e
echo "Coloque o certificado .p12 nesta pasta com o nome producao-efi.p12"
read -s -p "Senha do certificado P12: " SENHA
echo
openssl pkcs12 -in producao-efi.p12 -clcerts -nokeys -out cert.pem -passin pass:"$SENHA"
openssl pkcs12 -in producao-efi.p12 -nocerts -nodes -out key.pem -passin pass:"$SENHA"
echo "Gerado: cert.pem e key.pem"
