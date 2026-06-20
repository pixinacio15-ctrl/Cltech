@echo off
title Converter certificado Efi P12 para PEM
echo Coloque o certificado .p12 nesta pasta com o nome producao-efi.p12
echo.
set /p SENHA=Digite a senha do certificado P12:
openssl pkcs12 -in producao-efi.p12 -clcerts -nokeys -out cert.pem -passin pass:%SENHA%
openssl pkcs12 -in producao-efi.p12 -nocerts -nodes -out key.pem -passin pass:%SENHA%
echo.
echo Arquivos gerados:
echo cert.pem
echo key.pem
echo.
echo Use esses arquivos para criar o mTLS certificate no Cloudflare Worker.
pause
