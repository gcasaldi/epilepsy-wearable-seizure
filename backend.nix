
{ pkgs ? import (builtins.fetchTarball { url = "https://github.com/NixOS/nixpkgs/archive/nixos-24.05.tar.gz"; }) {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.python311Packages.fastapi
    pkgs.python311Packages.uvicorn
    pkgs.python311Packages.scikit-learn
    pkgs.python311Packages.numpy
    pkgs.python311Packages.pandas
    pkgs.python311Packages.websockets
    pkgs.python311Packages.pydantic
    pkgs.python311Packages.pydantic-settings
    pkgs.python311Packages.python-jose
    pkgs.python311Packages.cryptography
    pkgs.python311Packages.passlib
    pkgs.python311Packages.bcrypt
    pkgs.python311Packages.python-multipart
    pkgs.python311Packages.google-auth
    pkgs.python311Packages.sqlalchemy
  ];
}
