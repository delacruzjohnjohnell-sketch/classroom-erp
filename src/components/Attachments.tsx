"use client";

import { useEffect, useState } from "react";
import { Paperclip, Upload, Loader2, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";

export default function Attachments({ relatedTable, relatedId }: { relatedTable: string; relatedId: string }) {
  const { effectiveTenantId } = useSession();
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("attachments").select("*").eq("related_table", relatedTable).eq("related_id", relatedId).order("created_at", { ascending: false });
    setFiles(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [relatedId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveTenantId) return;
    setUploading(true);
    const path = `${effectiveTenantId}/${relatedTable}/${relatedId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    if (error) {
      toast.error(error.message || "Upload failed — the file was not attached.");
    } else {
      const res = await mutate(supabase.from("attachments").insert({
        tenant_id: effectiveTenantId, related_table: relatedTable, related_id: relatedId, file_path: path, file_name: file.name,
      }), { successMessage: "File attached." });
      if (ok(res)) await load();
    }
    setUploading(false);
    e.target.value = "";
  };

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 60);
    if (error) { toast.error(error.message || "Couldn't open that file."); return; }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="mt-3 pt-3 border-t border-hairline">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a8172] flex items-center gap-1.5"><Paperclip size={12} /> Attachments</div>
        <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-teal cursor-pointer">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {loading ? null : files.length === 0 ? (
        <div className="text-[12px] text-[#8a8172]">No files attached yet.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {files.map((f) => (
            <button key={f.id} onClick={() => openFile(f.file_path)} className="flex items-center gap-1.5 text-[12.5px] text-[#1B2430] text-left hover:text-teal">
              <FileText size={12} /> {f.file_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
