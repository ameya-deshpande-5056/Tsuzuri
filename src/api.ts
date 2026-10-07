import { invoke } from "@tauri-apps/api/core";

export interface DocumentPayload {
  path: string | null;
  file_name: string;
  content: string;
  directory: string | null;
}

export async function readDocumentFile(path: string): Promise<DocumentPayload> {
  const bridge = (window as any).TsuzuriBridge;
  if (path.startsWith("content://") && bridge && typeof bridge.readDocument === "function") {
    try {
      const raw = bridge.readDocument(path);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          path: parsed.uri || path,
          file_name: parsed.fileName || "document.md",
          content: parsed.content || "",
          directory: null,
        };
      }
    } catch (err) {
      console.warn("TsuzuriBridge.readDocument error:", err);
    }
  }
  return await invoke<DocumentPayload>("read_document_file", { path });
}

export async function writeDocumentFile(path: string, content: string): Promise<void> {
  const bridge = (window as any).TsuzuriBridge;
  if (path.startsWith("content://") && bridge && typeof bridge.saveDocument === "function") {
    try {
      const ok = bridge.saveDocument(path, content);
      if (ok) return;
    } catch (err) {
      console.warn("TsuzuriBridge.saveDocument error:", err);
    }
  }
  return await invoke<void>("write_document_file", { path, content });
}

export async function readLocalAsset(baseDir: string, relativePath: string): Promise<string> {
  return await invoke<string>("read_local_asset", { baseDir, relativePath });
}

export async function pickOpenFile(): Promise<string | null> {
  return await invoke<string | null>("pick_open_file");
}

export async function pickSaveFile(defaultName?: string): Promise<string | null> {
  return await invoke<string | null>("pick_save_file", { defaultName: defaultName ?? null });
}

export async function getCliTargetFile(): Promise<string | null> {
  return await invoke<string | null>("get_cli_target_file");
}

export async function openInBrowser(url: string): Promise<void> {
  return await invoke<void>("open_in_browser", { url });
}

