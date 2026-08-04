"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { Folder, File, Plus, Upload, FolderPlus, Download, Trash, ChevronRight, Sparkles } from "lucide-react"
import { formatDate } from "@/lib/utils"

export default function DocumentsPage() {
  const { currentOrg } = useAuth()
  const [folders, setFolders] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // Modals
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [folderName, setFolderName] = useState("")
  
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [fileName, setFileName] = useState("")
  // The real file the user picked. Size/type/URL are now all derived
  // server-side from these bytes rather than typed in by hand.
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [description, setDescription] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const [summaryModal, setSummaryModal] = useState<{isOpen: boolean, text: string, docName: string}>({ isOpen: false, text: "", docName: "" })
  const [isSummarizing, setIsSummarizing] = useState(false)

  const fetchDocuments = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const folderRes: any = await api.get(`/api/documents/folders${selectedFolderId ? `?parentId=${selectedFolderId}` : ""}`)
      setFolders(folderRes || [])

      const docRes: any = await api.get(`/api/documents${selectedFolderId ? `?folderId=${selectedFolderId}` : ""}`)
      setDocuments(docRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [currentOrg, selectedFolderId])

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/documents/folders", {
        name: folderName,
        parentId: selectedFolderId || undefined,
      })
      setShowFolderModal(false)
      setFolderName("")
      fetchDocuments()
    } catch (e) {
      console.error(e)
    }
  }

  const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // must match MAX_FILE_SIZE_BYTES on the API

  const handleFilePicked = (file: File | null) => {
    setUploadError("")
    setSelectedFile(file)
    // Pre-fill the display name from the filename so the user usually doesn't
    // have to type anything at all.
    if (file && !fileName.trim()) {
      setFileName(file.name.replace(/\.[^.]+$/, ""))
    }
  }

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      setUploadError("Choose a file to upload.")
      return
    }
    // Checked client-side purely for a fast, clear message — the API enforces
    // the same limit independently.
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setUploadError("That file is larger than the 25 MB limit.")
      return
    }

    setIsUploading(true)
    setUploadError("")
    try {
      const form = new FormData()
      form.append("file", selectedFile)
      if (fileName.trim()) form.append("name", fileName.trim())
      if (description.trim()) form.append("description", description.trim())
      if (selectedFolderId) form.append("folderId", selectedFolderId)

      // Content-Type is deliberately not set — the browser must generate it so
      // it can include the multipart boundary.
      await api.post("/api/documents", form)

      setShowUploadModal(false)
      setFileName("")
      setDescription("")
      setSelectedFile(null)
      fetchDocuments()
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    try {
      await api.delete(`/api/documents/${docId}`)
      fetchDocuments()
    } catch (e) {
      console.error(e)
    }
  }

  const handleSummarize = async (doc: any) => {
    setIsSummarizing(true)
    setSummaryModal({ isOpen: true, text: "", docName: doc.name })
    try {
      // Create this endpoint on backend to simulate AI summarization
      const res: any = await api.post("/api/ai/summarize-document", { documentId: doc.id })
      setSummaryModal({ isOpen: true, text: res.summary, docName: doc.name })
    } catch (e) {
      console.error(e)
      setSummaryModal({ isOpen: true, text: "Failed to generate summary. Please try again.", docName: doc.name })
    } finally {
      setIsSummarizing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Document Center</h1>
          <p className="text-sm text-muted mt-1">Hierarchical file storage, document templates, and version tracking.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFolderModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-border hover:bg-muted-bg text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <FolderPlus className="h-4 w-4" />
            <span>New Folder</span>
          </button>
          
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-md"
          >
            <Upload className="h-4 w-4" />
            <span>Upload File</span>
          </button>
        </div>
      </div>

      {/* Directory Breadcrumbs navigation */}
      {selectedFolderId && (
        <div className="flex items-center gap-2 text-xs font-bold text-violet-400">
          <button onClick={() => setSelectedFolderId(null)} className="hover:underline">root</button>
          <ChevronRight className="h-3 w-3 text-muted" />
          <span>Active Folder</span>
        </div>
      )}

      {/* Folders List Row */}
      {folders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {folders.map((f) => (
            <div 
              key={f.id}
              onClick={() => setSelectedFolderId(f.id)}
              className="glass p-4 rounded-xl border border-border/60 hover:border-violet-500/20 cursor-pointer flex items-center gap-3 transition-all"
            >
              <Folder className="h-5 w-5 text-violet-400 shrink-0" />
              <div className="truncate">
                <span className="text-xs font-bold text-slate-200 block truncate">{f.name}</span>
                <span className="text-[10px] text-muted block mt-0.5">{f._count?.documents || 0} files</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Files List Table */}
      <div className="glass rounded-2xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/20 border-b border-border/40 text-muted uppercase tracking-wider font-bold">
                <th className="p-4">Name</th>
                <th className="p-4">Size</th>
                <th className="p-4">Uploaded By</th>
                <th className="p-4">Date</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    No files found inside this directory folder.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted-bg/35 transition-colors">
                    <td className="p-4 font-semibold flex items-center gap-2.5 text-slate-200">
                      <File className="h-4 w-4 text-sky-400 shrink-0" />
                      <span>{doc.name}</span>
                    </td>
                    <td className="p-4 text-muted">{Math.round(doc.fileSize / 1024)} KB</td>
                    <td className="p-4">{doc.uploadedBy?.firstName || "N/A"}</td>
                    <td className="p-4 text-muted">{formatDate(doc.createdAt)}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => handleSummarize(doc)}
                        className="px-2 py-1 bg-brand-600/10 hover:bg-brand-600/20 text-brand-400 rounded text-xs font-semibold flex items-center gap-1 inline-flex mr-2 transition-colors"
                      >
                        <Sparkles className="h-3 w-3" /> Summarize
                      </button>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 hover:bg-muted-bg rounded text-slate-400 hover:text-foreground inline-block"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1 hover:bg-red-500/5 rounded text-rose-400"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Folder</h3>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Folder Name</label>
                <input
                  type="text"
                  required
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="Design Templates..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 border border-border hover:bg-muted-bg rounded-xl text-xs font-semibold text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Save Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Upload Document</h3>
            <form onSubmit={handleUploadDocument} className="space-y-4">
              {uploadError && (
                <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-xs">
                  {uploadError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">File</label>
                <input
                  type="file"
                  required
                  onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-600 file:text-white hover:file:bg-brand-500 file:cursor-pointer"
                />
                {selectedFile && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {selectedFile.name} — {(selectedFile.size / 1024).toFixed(0)} KB
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  Up to 25 MB. PDF, Office documents, images, text, CSV or ZIP.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="Defaults to the filename"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm h-16"
                  placeholder="Optional"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-border hover:bg-muted-bg rounded-xl text-xs font-semibold text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                      Uploading...
                    </>
                  ) : (
                    "Upload File"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Summary Modal */}
      {summaryModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-card border border-brand-500/30 p-6 rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.1)] relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-400" />
              AI Summary: {summaryModal.docName}
            </h3>
            
            <div className="bg-slate-950/20 border border-border/40 rounded-xl p-4 min-h-[120px] text-sm text-slate-300 leading-relaxed">
              {isSummarizing ? (
                <div className="flex items-center gap-2 text-brand-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-500"></div>
                  <span>Analyzing document contents...</span>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{summaryModal.text}</div>
              )}
            </div>

            <div className="flex justify-end pt-4 mt-2">
              <button
                onClick={() => setSummaryModal({ isOpen: false, text: "", docName: "" })}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
