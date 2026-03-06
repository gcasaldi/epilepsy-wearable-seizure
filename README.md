This is a machine learning project that uses a FastAPI backend and a Svelte frontend.

**To run the backend:**

1.  Open a terminal.
2.  Start a Nix shell with the correct dependencies by running:
    ```bash
    nix-shell .idx/dev.nix
    ```
3.  Once in the Nix shell, run the following command to start the server:
    ```bash
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8010
    ```

**Note:** Do not use `nix-shell -p` to load `.idx/dev.nix`, because `-p` does not read that file. Use `nix-shell .idx/dev.nix` directly.
