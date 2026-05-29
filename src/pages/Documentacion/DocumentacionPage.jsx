import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ArrowLeft, BookOpen } from "lucide-react";
import { auth, db, storage } from "../../firebase";
import {
    Brand,
    GhostButton,
    Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";

function safe(v) {
    return String(v ?? "").trim();
}

function fmtDateTime(ts) {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "";
    return d.toLocaleString("es-CR");
}

function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!n) return "0 KB";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function extFromName(name) {
    const parts = String(name || "").split(".");
    return parts.length > 1 ? parts.pop().toUpperCase() : "FILE";
}

function slugify(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

export default function DocumentacionPage() {
    const nav = useNavigate();
    const [showUploadModal, setShowUploadModal] = useState(false);

    //Buscar sction
    const [showDocSearch, setShowDocSearch] = useState(false);

    const [showViewerHelp, setShowViewerHelp] = useState(false);
    const [showViewerModal, setShowViewerModal] = useState(false);
    const [profile, setProfile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [err, setErr] = useState("");
    const [docs, setDocs] = useState([]);
    const [viewerDoc, setViewerDoc] = useState(null);

    const [qText, setQText] = useState("");
    const [form, setForm] = useState({
        title: "",
        category: "",
        description: "",
    });
    const [pdfFile, setPdfFile] = useState(null);

    // Update modal state
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updatePdfFile, setUpdatePdfFile] = useState(null);

    // Colecciones state
    const [showColeccionesModal, setShowColeccionesModal] = useState(false);
    const [colecciones, setColecciones] = useState([]);
    const [loadingColecciones, setLoadingColecciones] = useState(false);
    const [coleccionForm, setColeccionForm] = useState({ name: "", description: "" });
    const [showNewColeccionForm, setShowNewColeccionForm] = useState(false);
    const [selectedColeccion, setSelectedColeccion] = useState(null);
    const [coleccionBusy, setColeccionBusy] = useState(false);
    const [coleccionErr, setColeccionErr] = useState("");

    const loadProfile = async () => {
        const currentUser = auth.currentUser;

        if (!currentUser?.uid) {
            throw new Error("No hay usuario autenticado.");
        }

        const profileRef = doc(db, "profiles", currentUser.uid);
        const profileSnap = await getDoc(profileRef);

        if (!profileSnap.exists()) {
            throw new Error("No se encontró el profile del usuario.");
        }

        const data = profileSnap.data();
        setProfile(data);
        return data;
    };

    /** Lista global: sin filtro por tenant ni company; todos los roles ven la misma biblioteca. */
    const loadDocs = async () => {
        setLoadingDocs(true);
        setErr("");

        try {
            const q = query(
                collection(db, "documentacion"),
                orderBy("createdAt", "desc")
            );

            const snap = await getDocs(q);
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setDocs(list);

            if (list.length > 0) {
                setViewerDoc((prev) => prev ?? list[0]);
            }
        } catch (e) {
            console.error(e);
            setErr("No se pudo cargar la biblioteca documental.");
        } finally {
            setLoadingDocs(false);
        }
    };

    const loadColecciones = async () => {
        setLoadingColecciones(true);
        setColeccionErr("");
        try {
            const q = query(
                collection(db, "colecciones"),
                orderBy("createdAt", "desc")
            );
            const snap = await getDocs(q);
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setColecciones(list);
        } catch (e) {
            console.error(e);
            setColeccionErr("No se pudo cargar las colecciones.");
        } finally {
            setLoadingColecciones(false);
        }
    };

    const handleCreateColeccion = async () => {
        const name = safe(coleccionForm.name);
        if (!name) return;
        setColeccionBusy(true);
        setColeccionErr("");
        try {
            const currentUser = auth.currentUser;
            if (!currentUser?.uid) throw new Error("No hay usuario autenticado.");

            await addDoc(collection(db, "colecciones"), {
                name,
                nameLower: name.toLowerCase(),
                description: safe(coleccionForm.description),
                documentIds: [],
                createdBy: currentUser.uid,
                createdAt: serverTimestamp(),
            });
            setColeccionForm({ name: "", description: "" });
            setShowNewColeccionForm(false);
            await loadColecciones();
        } catch (e) {
            console.error(e);
            setColeccionErr(e?.message || "No se pudo crear la colección.");
        } finally {
            setColeccionBusy(false);
        }
    };

    const handleDeleteColeccion = async (colId) => {
        if (!colId) return;
        setColeccionBusy(true);
        setColeccionErr("");
        try {
            await deleteDoc(doc(db, "colecciones", colId));
            if (selectedColeccion?.id === colId) setSelectedColeccion(null);
            await loadColecciones();
        } catch (e) {
            console.error(e);
            setColeccionErr("No se pudo eliminar la colección.");
        } finally {
            setColeccionBusy(false);
        }
    };

    const handleToggleDocInColeccion = async (docId) => {
        if (!selectedColeccion?.id || !docId) return;
        setColeccionBusy(true);
        setColeccionErr("");
        try {
            const currentIds = selectedColeccion.documentIds || [];
            const newIds = currentIds.includes(docId)
                ? currentIds.filter((id) => id !== docId)
                : [...currentIds, docId];

            await updateDoc(doc(db, "colecciones", selectedColeccion.id), {
                documentIds: newIds,
            });

            setSelectedColeccion((prev) => ({ ...prev, documentIds: newIds }));
            setColecciones((prev) =>
                prev.map((c) =>
                    c.id === selectedColeccion.id ? { ...c, documentIds: newIds } : c
                )
            );
        } catch (e) {
            console.error(e);
            setColeccionErr("No se pudo actualizar la colección.");
        } finally {
            setColeccionBusy(false);
        }
    };

    const openColeccionesModal = () => {
        setColeccionErr("");
        setShowColeccionesModal(true);
        loadColecciones();
    };

    const closeColeccionesModal = () => {
        if (coleccionBusy) return;
        setShowColeccionesModal(false);
        setSelectedColeccion(null);
        setShowNewColeccionForm(false);
    };

    const coleccionDocs = useMemo(() => {
        if (!selectedColeccion?.documentIds?.length) return [];
        return docs.filter((d) => selectedColeccion.documentIds.includes(d.id));
    }, [selectedColeccion, docs]);

    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        const prevBg = document.body.style.background;
        const prevMargin = document.body.style.margin;

        document.body.style.overflow = "hidden";
        document.body.style.background = "#F6F7FB";
        document.body.style.margin = "0";

        (async () => {
            try {
                await loadDocs();
            } catch (e) {
                console.error(e);
                setErr("No se pudo cargar la biblioteca documental.");
            }
            try {
                await loadProfile();
            } catch (e) {
                console.error(e);
                setErr((prev) => prev || e?.message || "No se pudo cargar el perfil del usuario.");
            }
        })();

        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.background = prevBg;
            document.body.style.margin = prevMargin;
        };
    }, []);

    const onChangeForm = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    /** Solo administrativo y dev pueden subir o reemplazar metadatos (alineado a reglas Firestore). */
    const isDocumentacionUploader = useMemo(() => {
        const r = profile?.role;
        return r === "administrativo" || r === "dev";
    }, [profile?.role]);

    useEffect(() => {
        if (profile && !isDocumentacionUploader) {
            setShowUploadModal(false);
        }
    }, [profile, isDocumentacionUploader]);

    const canUpload = useMemo(() => {
        return (
            isDocumentacionUploader &&
            !busy &&
            !!safe(form.title) &&
            !!safe(form.category) &&
            !!pdfFile &&
            pdfFile.type === "application/pdf"
        );
    }, [isDocumentacionUploader, busy, form, pdfFile]);

    const filteredDocs = useMemo(() => {
        const t = safe(qText).toLowerCase();
        let result = docs;

        if (t) {
            result = docs.filter((d) => {
                const title = safe(d.title).toLowerCase();
                const category = safe(d.category).toLowerCase();
                const description = safe(d.description).toLowerCase();
                const fileName = safe(d.fileName).toLowerCase();

                return (
                    title.includes(t) ||
                    category.includes(t) ||
                    description.includes(t) ||
                    fileName.includes(t)
                );
            });
        }

        return [...result].sort((a, b) =>
            safe(a.title).localeCompare(safe(b.title), "es", { sensitivity: "base" })
        );
    }, [docs, qText]);

    const categories = useMemo(() => {
        const unique = Array.from(
            new Set(docs.map((d) => safe(d.category)).filter(Boolean))
        );
        return unique.sort((a, b) => a.localeCompare(b));
    }, [docs]);

    const stats = useMemo(() => {
        const total = docs.length;
        const totalSize = docs.reduce((acc, d) => acc + Number(d.size || 0), 0);
        const cats = new Set(docs.map((d) => safe(d.category)).filter(Boolean)).size;

        return {
            total,
            totalSize: formatBytes(totalSize),
            cats,
        };
    }, [docs]);

    const handleUpload = async (e) => {
        e?.preventDefault?.();
        if (!isDocumentacionUploader) {
            setErr("Solo usuarios administrativos o desarrollo pueden subir documentación.");
            return;
        }
        if (!canUpload) return;

        setBusy(true);
        setErr("");

        try {
            const currentUser = auth.currentUser;

            if (!currentUser?.uid) {
                throw new Error("No hay usuario autenticado.");
            }

            const currentProfile = profile ?? (await loadProfile());

            const cleanTitle = safe(form.title);
            const cleanCategory = safe(form.category);
            const cleanDescription = safe(form.description);

            const now = Date.now();
            const slug = slugify(cleanTitle) || "documento";
            const tenantId = currentProfile?.tenantId;
            const company = currentProfile?.company;

            if (!tenantId || !company) {
                throw new Error("El usuario no tiene tenantId o company configurado.");
            }

            const storagePath = `documentacion/${tenantId}/${company}/${cleanCategory}/${now}-${slug}.pdf`;

            const sRef = ref(storage, storagePath);
            await uploadBytes(sRef, pdfFile, {
                contentType: "application/pdf",
            });

            const url = await getDownloadURL(sRef);

            const payload = {
                tenantId,
                company,
                title: cleanTitle,
                titleLower: cleanTitle.toLowerCase(),
                category: cleanCategory,
                categoryLower: cleanCategory.toLowerCase(),
                description: cleanDescription,
                fileName: pdfFile.name,
                size: pdfFile.size || 0,
                fileType: pdfFile.type || "application/pdf",
                ext: extFromName(pdfFile.name),
                url,
                storagePath,
                createdBy: currentUser.uid,
                createdAt: serverTimestamp(),
            };

            await addDoc(collection(db, "documentacion"), payload);

            setForm({
                title: "",
                category: "",
                description: "",
            });
            setPdfFile(null);

            await loadDocs();
            setShowUploadModal(false);
        } catch (e) {
            console.error(e);
            setErr(e?.message || "No se pudo subir el PDF. Revisa Firebase Storage y Firestore.");
        } finally {
            setBusy(false);
        }
    };

    const back = () => nav("/");

    /** Eliminar documento: borra de Firestore y de Storage */
    const handleDeleteDoc = async () => {
        if (!viewerDoc?.id || !isDocumentacionUploader) return;
        const confirmDelete = window.confirm(
            `¿Estás seguro de eliminar "${safe(viewerDoc.title)}"? Esta acción no se puede deshacer.`
        );
        if (!confirmDelete) return;

        setBusy(true);
        setErr("");
        try {
            // Eliminar archivo de Storage si existe storagePath
            if (viewerDoc.storagePath) {
                try {
                    const sRef = ref(storage, viewerDoc.storagePath);
                    await deleteObject(sRef);
                } catch (storageErr) {
                    console.warn("No se pudo eliminar el archivo de Storage:", storageErr);
                }
            }
            // Eliminar documento de Firestore
            await deleteDoc(doc(db, "documentacion", viewerDoc.id));
            setViewerDoc(null);
            await loadDocs();
        } catch (e) {
            console.error(e);
            setErr(e?.message || "No se pudo eliminar el documento.");
        } finally {
            setBusy(false);
        }
    };

    /** Actualizar PDF: sube nuevo archivo, elimina el anterior, mantiene metadatos */
    const handleUpdateDoc = async () => {
        if (!viewerDoc?.id || !isDocumentacionUploader || !updatePdfFile) return;
        if (updatePdfFile.type !== "application/pdf") {
            setErr("Solo se permiten archivos PDF.");
            return;
        }

        setBusy(true);
        setErr("");
        try {
            const currentUser = auth.currentUser;
            if (!currentUser?.uid) throw new Error("No hay usuario autenticado.");

            // Eliminar archivo anterior de Storage si existe
            if (viewerDoc.storagePath) {
                try {
                    const oldRef = ref(storage, viewerDoc.storagePath);
                    await deleteObject(oldRef);
                } catch (storageErr) {
                    console.warn("No se pudo eliminar el archivo anterior:", storageErr);
                }
            }

            // Subir nuevo archivo manteniendo la misma estructura de path
            const slug = slugify(safe(viewerDoc.title)) || "documento";
            const now = Date.now();
            const tenantId = viewerDoc.tenantId || profile?.tenantId;
            const company = viewerDoc.company || profile?.company;
            const category = safe(viewerDoc.category);

            const storagePath = `documentacion/${tenantId}/${company}/${category}/${now}-${slug}.pdf`;
            const sRef = ref(storage, storagePath);
            await uploadBytes(sRef, updatePdfFile, { contentType: "application/pdf" });
            const url = await getDownloadURL(sRef);

            // Actualizar documento en Firestore manteniendo metadatos
            await updateDoc(doc(db, "documentacion", viewerDoc.id), {
                url,
                storagePath,
                fileName: updatePdfFile.name,
                size: updatePdfFile.size || 0,
                fileType: updatePdfFile.type || "application/pdf",
                ext: extFromName(updatePdfFile.name),
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.uid,
            });

            setUpdatePdfFile(null);
            setShowUpdateModal(false);
            await loadDocs();
            // Actualizar el viewerDoc con los nuevos datos
            const updatedSnap = await getDoc(doc(db, "documentacion", viewerDoc.id));
            if (updatedSnap.exists()) {
                setViewerDoc({ id: updatedSnap.id, ...updatedSnap.data() });
            }
        } catch (e) {
            console.error(e);
            setErr(e?.message || "No se pudo actualizar el documento.");
        } finally {
            setBusy(false);
        }
    };

    const openUpdateModal = () => {
        if (!viewerDoc?.id || !isDocumentacionUploader) return;
        setErr("");
        setUpdatePdfFile(null);
        setShowUpdateModal(true);
    };

    const closeUpdateModal = () => {
        if (busy) return;
        setShowUpdateModal(false);
        setUpdatePdfFile(null);
    };

    //Modal new document
    const openUploadModal = () => {
        if (!isDocumentacionUploader) return;
        setErr("");
        setShowUploadModal(true);
    };

    const closeUploadModal = () => {
        if (busy) return;
        setShowUploadModal(false);
    };

    const openViewerModal = () => {
        if (!viewerDoc?.url) return;
        setShowViewerModal(true);
    };

    const closeViewerModal = () => {
        setShowViewerModal(false);
    };

    return (
        <div style={ui.shell}>
            <Topbar>
                <Brand
                    icon={BookOpen}
                    title="Documentación"
                    subtitle="Biblioteca corporativa"
                    onClick={back}
                />
                <Topbar.Right>
                    <Topbar.UserHint>
                        {stats.total} documento{stats.total !== 1 ? "s" : ""}
                    </Topbar.UserHint>
                    <GhostButton icon={ArrowLeft} onClick={back}>
                        Inicio
                    </GhostButton>
                </Topbar.Right>
            </Topbar>

            <div style={ui.main}>
                <div style={ui.container}>
                    <div style={ui.heroCard}>
                        <div style={{ display: "grid", gap: 10 }}>
                            <div style={ui.kickerRow}>
                                <span style={ui.kickerDot} />
                                <div style={ui.kicker}>Repositorio central</div>
                                <span style={ui.badge}>{busy ? "Subiendo…" : "Operativo"}</span>
                            </div>

                            <h1 style={ui.title}>Centro de documentación empresarial</h1>

                        </div>
                    </div>

                    <div style={ui.contentGrid}>
                        <div style={ui.leftCol}>
                            <div style={ui.panel}>
                                <div style={ui.panelHead}>
                                    <div>
                                        <div style={ui.panelTitle}>Gestión documental</div>
                                        <div style={ui.panelText}>
                    
                                        </div>
                                    </div>

                                    <div style={ui.panelActions}>
                                        {isDocumentacionUploader && (
                                            <button
                                                type="button"
                                                onClick={openUploadModal}
                                                style={ui.heroActionBtn}
                                                title="Nuevo documento"
                                            >
                                                <span style={ui.heroActionIcon}>＋</span>
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => setShowDocSearch((prev) => !prev)}
                                            style={{
                                                ...ui.searchToggleBtn,
                                                ...(showDocSearch ? ui.searchToggleBtnActive : {}),
                                            }}
                                            title={showDocSearch ? "Ocultar búsqueda" : "Buscar documento"}
                                        >
                                            <span style={ui.searchToggleIcon}>⌕</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={openColeccionesModal}
                                            style={ui.coleccionesBtn}
                                            title="Colecciones"
                                        >
                                            <span style={ui.coleccionesBtnIcon}>📁</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {showDocSearch && (
                                <div style={ui.panel}>
                                    <div style={ui.panelHead}>
                                        <div>
                                            <div style={ui.panelTitle}>Biblioteca documental</div>
                                        </div>
                                    </div>

                                    <div style={ui.searchWrap}>
                                        <span style={ui.searchIcon}>⌁</span>
                                        <input
                                            value={qText}
                                            onChange={(e) => setQText(e.target.value)}
                                            placeholder="Buscar por título, categoría o archivo…"
                                            style={ui.searchInput}
                                            disabled={busy}
                                        />
                                        {!!qText && (
                                            <button type="button" onClick={() => setQText("")} style={ui.clearBtn}>
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    {categories.length > 0 && (
                                        <div style={ui.categoryRow}>
                                            {categories.map((cat) => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setQText(cat)}
                                                    style={ui.categoryChip}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {err && <div style={ui.errBox}>{err}</div>}

                                    <div style={ui.docList}>
                                        {loadingDocs ? (
                                            <div style={ui.empty}>Cargando documentos…</div>
                                        ) : filteredDocs.length === 0 ? (
                                            <div style={ui.empty}>No hay documentos que coincidan con la búsqueda.</div>
                                        ) : (
                                            filteredDocs.map((doc) => {
                                                const active = viewerDoc?.id === doc.id;

                                                return (
                                                    <button
                                                        key={doc.id}
                                                        type="button"
                                                        onClick={() => setViewerDoc(doc)}
                                                        style={{
                                                            ...ui.docRow,
                                                            ...(active ? ui.docRowActive : {}),
                                                        }}
                                                    >
                                                        <div style={ui.docIcon}>{doc.ext || "PDF"}</div>

                                                        <div style={ui.docInfo}>
                                                            <div style={ui.docTitle}>{safe(doc.title) || "Documento sin título"}</div>
                                                            <div style={ui.docMeta}>
                                                                <span style={ui.docChip}>{safe(doc.category) || "General"}</span>
                                                                <span style={ui.docMetaText}>{formatBytes(doc.size)}</span>
                                                                <span style={ui.docMetaText}>{fmtDateTime(doc.createdAt)}</span>
                                                            </div>
                                                            {!!safe(doc.description) && (
                                                                <div style={ui.docDesc}>{safe(doc.description)}</div>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={ui.rightCol}>
                            <div style={ui.viewerPanel}>
                                <div style={ui.viewerSectionTitleWrap}>
                                    <div style={ui.viewerSectionTitleInner}>
                                        <div style={ui.viewerSectionKicker}>Lectura</div>
                                        <div style={ui.viewerSectionTitle}>Visor documental</div>
                                        {viewerDoc?.id && (
                                            <div style={ui.viewerDocUid}>UID: {viewerDoc.id}</div>
                                        )}
                                    </div>
                                </div>
                                <div style={ui.viewerHead}>
                                    <div>
                                        <div style={ui.viewerTitle}>
                                            {viewerDoc ? safe(viewerDoc.title) : "Visor documental"}
                                        </div>
                                        <div style={ui.viewerSub}>
                                            {viewerDoc
                                                ? `${safe(viewerDoc.category) || "General"} · ${formatBytes(viewerDoc.size)}`
                                                : "Seleccioná un documento para visualizarlo"}
                                        </div>
                                    </div>

                                    {viewerDoc?.url && (
                                        <div style={ui.viewerHeadActions}>
                                            {isDocumentacionUploader && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={openUpdateModal}
                                                        style={ui.viewerUpdateBtn}
                                                        title="Reemplazar PDF"
                                                        disabled={busy}
                                                    >
                                                        <span style={ui.viewerActionIcon}>↻</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleDeleteDoc}
                                                        style={ui.viewerDeleteBtn}
                                                        title="Eliminar documento"
                                                        disabled={busy}
                                                    >
                                                        <span style={ui.viewerActionIcon}>🗑</span>
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                type="button"
                                                onClick={openViewerModal}
                                                style={ui.viewerExpandBtn}
                                                title="Expandir visor"
                                            >
                                                <span style={ui.viewerExpandIcon}>⤢</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div style={ui.viewerBody}>
                                    {viewerDoc?.url ? (
                                        <iframe
                                            title={viewerDoc.title || "Documento PDF"}
                                            src={`${viewerDoc.url}#toolbar=1&navpanes=0&scrollbar=1`}
                                            style={ui.iframe}
                                        />
                                    ) : (
                                        <div style={ui.viewerEmpty}>
                                            <div style={ui.viewerEmptyIcon}>PDF</div>
                                            <div style={ui.viewerEmptyTitle}>Sin documento seleccionado</div>
                                            <div style={ui.viewerEmptyText}>
                                                Elegí un archivo desde la biblioteca para visualizar normas, políticas o procesos.
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {viewerDoc && (
                                    <div style={ui.viewerFooter}>
                                        <div style={ui.viewerFooterTitle}>Resumen del documento</div>
                                        <div style={ui.viewerFooterText}>
                                            {safe(viewerDoc.description) || "Este documento no tiene una descripción registrada."}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {showUploadModal && (
                <div style={ui.modalBackdrop} onClick={closeUploadModal}>
                    <div
                        style={ui.modalCard}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={ui.modalHeader}>
                            <div>
                                <div style={ui.modalKicker}>Biblioteca corporativa</div>
                                <div style={ui.modalTitle}>Cargar nuevo documento</div>
                                <div style={ui.modalText}>
                                    Subí un PDF oficial para incorporarlo al repositorio documental de la empresa.
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeUploadModal}
                                style={ui.modalCloseBtn}
                                disabled={busy}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleUpload} style={ui.modalForm}>
                            <div style={ui.formGrid}>
                                <div style={ui.field}>
                                    <div style={ui.label}>Título del documento</div>
                                    <input
                                        value={form.title}
                                        onChange={(e) => onChangeForm("title", e.target.value)}
                                        placeholder="Ej: Política de Seguridad Industrial"
                                        style={ui.input}
                                        disabled={busy}
                                    />
                                </div>

                                <div style={ui.field}>
                                    <div style={ui.label}>Categoría</div>
                                    <input
                                        value={form.category}
                                        onChange={(e) => onChangeForm("category", e.target.value)}
                                        placeholder="Ej: Normas, Políticas, Procesos"
                                        style={ui.input}
                                        disabled={busy}
                                    />
                                </div>

                                <div style={ui.field}>
                                    <div style={ui.label}>Descripción</div>
                                    <textarea
                                        value={form.description}
                                        onChange={(e) => onChangeForm("description", e.target.value)}
                                        placeholder="Resumen ejecutivo del contenido del documento."
                                        style={ui.textarea}
                                        disabled={busy}
                                    />
                                </div>

                                <div style={ui.uploadBox}>
                                    <div style={ui.uploadIcon}>PDF</div>

                                    <div style={{ display: "grid", gap: 6 }}>
                                        <div style={ui.uploadTitle}>Archivo PDF</div>
                                        <div style={ui.uploadText}>
                                            Seleccioná el documento oficial que querés agregar a la biblioteca.
                                        </div>
                                        {pdfFile && (
                                            <div style={ui.fileBadge}>
                                                {pdfFile.name} · {formatBytes(pdfFile.size)}
                                            </div>
                                        )}
                                    </div>

                                    <label style={ui.fileBtn}>
                                        Seleccionar PDF
                                        <input
                                            type="file"
                                            accept="application/pdf"
                                            style={{ display: "none" }}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0] || null;
                                                setPdfFile(file);
                                            }}
                                            disabled={busy}
                                        />
                                    </label>
                                </div>

                                {err && <div style={ui.errBox}>{err}</div>}
                            </div>

                            <div style={ui.modalFooter}>
                                <button
                                    type="button"
                                    onClick={closeUploadModal}
                                    style={ui.btnSecondary}
                                    disabled={busy}
                                >
                                    Cancelar
                                </button>

                                <button
                                    type="submit"
                                    disabled={!canUpload}
                                    style={{
                                        ...ui.btnPrimary,
                                        ...(!canUpload ? ui.btnDisabled : {}),
                                    }}
                                >
                                    {busy ? "Subiendo documento…" : "Guardar en biblioteca"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal visor de documentos */}
            {showViewerModal && viewerDoc?.url && (
                <div style={ui.viewerModalBackdrop} onClick={closeViewerModal}>
                    <div
                        style={ui.viewerModalCard}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={ui.viewerModalHeader}>
                            <div>
                                <div style={ui.viewerModalKicker}>Lectura ampliada</div>
                                <div style={ui.viewerModalTitle}>
                                    {safe(viewerDoc.title) || "Documento"}
                                </div>
                                <div style={ui.viewerModalMeta}>
                                    {`${safe(viewerDoc.category) || "General"} · ${formatBytes(viewerDoc.size)}`}
                                </div>
                            </div>

                            <div style={ui.viewerModalActions}>
                                <button
                                    type="button"
                                    onClick={() => setShowViewerHelp(true)}
                                    style={ui.viewerHelpBtn}
                                    title="Ayuda de visualización"
                                >
                                    ?
                                </button>

                                <button
                                    type="button"
                                    onClick={closeViewerModal}
                                    style={ui.viewerModalCloseBtn}
                                    title="Cerrar"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div style={ui.viewerModalBody}>
                            <iframe
                                title={viewerDoc.title || "Documento PDF ampliado"}
                                src={`${viewerDoc.url}#toolbar=1&navpanes=0&scrollbar=1`}
                                style={ui.viewerModalIframe}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showViewerHelp && (
                <div style={ui.viewerHelpOverlay} onClick={() => setShowViewerHelp(false)}>
                    <div
                        style={ui.viewerHelpCard}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={ui.viewerHelpKicker}>Sugerencia de visualización</div>
                        <div style={ui.viewerHelpTitle}>Mejor experiencia en pantalla completa</div>
                        <div style={ui.viewerHelpText}>
                            Para ver el documento con mayor comodidad, presioná <b>F11</b> y activá el modo de pantalla completa del navegador.
                        </div>

                        <div style={ui.viewerHelpNote}>
                            También podés usar el zoom del visor para ajustar la lectura según el tamaño del documento.
                        </div>

                        <div style={ui.viewerHelpFooter}>
                            <button
                                type="button"
                                onClick={() => setShowViewerHelp(false)}
                                style={ui.viewerHelpOkBtn}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal actualizar documento */}
            {showUpdateModal && viewerDoc && (
                <div style={ui.modalBackdrop} onClick={closeUpdateModal}>
                    <div
                        style={ui.updateModalCard}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={ui.modalHeader}>
                            <div>
                                <div style={ui.modalKicker}>Actualización documental</div>
                                <div style={ui.modalTitle}>Reemplazar PDF</div>
                                <div style={ui.modalText}>
                                    Se reemplazará el archivo actual manteniendo el título, categoría y descripción del documento.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeUpdateModal}
                                style={ui.modalCloseBtn}
                                disabled={busy}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={ui.updateModalBody}>
                            <div style={ui.updateDocInfo}>
                                <div style={ui.updateDocInfoLabel}>Documento actual</div>
                                <div style={ui.updateDocInfoTitle}>{safe(viewerDoc.title)}</div>
                                <div style={ui.updateDocInfoMeta}>
                                    {safe(viewerDoc.category) || "General"} · {formatBytes(viewerDoc.size)} · {safe(viewerDoc.fileName)}
                                </div>
                            </div>

                            <div style={ui.uploadBox}>
                                <div style={ui.uploadIcon}>PDF</div>
                                <div style={{ display: "grid", gap: 6 }}>
                                    <div style={ui.uploadTitle}>Nuevo archivo PDF</div>
                                    <div style={ui.uploadText}>
                                        Seleccioná el PDF que reemplazará al documento actual.
                                    </div>
                                    {updatePdfFile && (
                                        <div style={ui.fileBadge}>
                                            {updatePdfFile.name} · {formatBytes(updatePdfFile.size)}
                                        </div>
                                    )}
                                </div>
                                <label style={ui.fileBtn}>
                                    Seleccionar PDF
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] || null;
                                            setUpdatePdfFile(file);
                                        }}
                                        disabled={busy}
                                    />
                                </label>
                            </div>

                            {err && <div style={ui.errBox}>{err}</div>}
                        </div>

                        <div style={ui.updateModalFooter}>
                            <button
                                type="button"
                                onClick={closeUpdateModal}
                                style={ui.btnSecondary}
                                disabled={busy}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleUpdateDoc}
                                disabled={!updatePdfFile || busy}
                                style={{
                                    ...ui.btnPrimary,
                                    ...(!updatePdfFile || busy ? ui.btnDisabled : {}),
                                }}
                            >
                                {busy ? "Actualizando…" : "Reemplazar documento"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Colecciones */}
            {showColeccionesModal && (
                <div style={ui.modalBackdrop} onClick={closeColeccionesModal}>
                    <div
                        style={ui.coleccionesModalCard}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={ui.coleccionesModalHeader}>
                            <div>
                                <div style={ui.modalKicker}>Organización documental</div>
                                <div style={ui.modalTitle}>Colecciones</div>
                                <div style={ui.modalText}>
                                    Agrupá documentos de la biblioteca en colecciones temáticas para facilitar el acceso y la distribución.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeColeccionesModal}
                                style={ui.modalCloseBtn}
                                disabled={coleccionBusy}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={ui.coleccionesBody}>
                            {/* Left: lista de colecciones */}
                            <div style={ui.coleccionesLeft}>
                                <div style={ui.coleccionesLeftHead}>
                                    <div style={ui.coleccionesLeftTitle}>Mis colecciones</div>
                                    {isDocumentacionUploader && (
                                        <button
                                            type="button"
                                            onClick={() => setShowNewColeccionForm(true)}
                                            style={ui.coleccionesAddBtn}
                                            disabled={coleccionBusy}
                                        >
                                            ＋ Nueva
                                        </button>
                                    )}
                                </div>

                                {showNewColeccionForm && (
                                    <div style={ui.coleccionesNewForm}>
                                        <input
                                            value={coleccionForm.name}
                                            onChange={(e) => setColeccionForm((p) => ({ ...p, name: e.target.value }))}
                                            placeholder="Nombre de la colección"
                                            style={ui.coleccionesNewInput}
                                            disabled={coleccionBusy}
                                        />
                                        <input
                                            value={coleccionForm.description}
                                            onChange={(e) => setColeccionForm((p) => ({ ...p, description: e.target.value }))}
                                            placeholder="Descripción (opcional)"
                                            style={ui.coleccionesNewInput}
                                            disabled={coleccionBusy}
                                        />
                                        <div style={ui.coleccionesNewActions}>
                                            <button
                                                type="button"
                                                onClick={() => { setShowNewColeccionForm(false); setColeccionForm({ name: "", description: "" }); }}
                                                style={ui.coleccionesNewCancelBtn}
                                                disabled={coleccionBusy}
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleCreateColeccion}
                                                style={{
                                                    ...ui.coleccionesNewSaveBtn,
                                                    ...(!safe(coleccionForm.name) ? ui.btnDisabled : {}),
                                                }}
                                                disabled={!safe(coleccionForm.name) || coleccionBusy}
                                            >
                                                {coleccionBusy ? "Creando…" : "Crear"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {coleccionErr && <div style={ui.errBox}>{coleccionErr}</div>}

                                <div style={ui.coleccionesList}>
                                    {loadingColecciones ? (
                                        <div style={ui.empty}>Cargando colecciones…</div>
                                    ) : colecciones.length === 0 ? (
                                        <div style={ui.empty}>No hay colecciones creadas aún.</div>
                                    ) : (
                                        colecciones.map((col) => {
                                            const active = selectedColeccion?.id === col.id;
                                            return (
                                                <div
                                                    key={col.id}
                                                    style={{
                                                        ...ui.coleccionRow,
                                                        ...(active ? ui.coleccionRowActive : {}),
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedColeccion(col)}
                                                        style={ui.coleccionRowBtn}
                                                    >
                                                        <div style={ui.coleccionRowIcon}>📁</div>
                                                        <div style={ui.coleccionRowInfo}>
                                                            <div style={ui.coleccionRowName}>{safe(col.name)}</div>
                                                            <div style={ui.coleccionRowMeta}>
                                                                {(col.documentIds || []).length} documento{(col.documentIds || []).length !== 1 ? "s" : ""}
                                                            </div>
                                                        </div>
                                                    </button>
                                                    {isDocumentacionUploader && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteColeccion(col.id)}
                                                            style={ui.coleccionDeleteBtn}
                                                            title="Eliminar colección"
                                                            disabled={coleccionBusy}
                                                        >
                                                            🗑
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Right: documentos de la colección seleccionada */}
                            <div style={ui.coleccionesRight}>
                                {selectedColeccion ? (
                                    <>
                                        <div style={ui.coleccionesRightHead}>
                                            <div>
                                                <div style={ui.coleccionesRightTitle}>{safe(selectedColeccion.name)}</div>
                                                {!!safe(selectedColeccion.description) && (
                                                    <div style={ui.coleccionesRightDesc}>{safe(selectedColeccion.description)}</div>
                                                )}
                                            </div>
                                            <div style={ui.coleccionesRightBadge}>
                                                {(selectedColeccion.documentIds || []).length} doc{(selectedColeccion.documentIds || []).length !== 1 ? "s" : ""}
                                            </div>
                                        </div>

                                        <div style={ui.coleccionesRightSubtitle}>
                                            Seleccioná documentos para incluirlos en esta colección:
                                        </div>

                                        <div style={ui.coleccionesDocGrid}>
                                            {docs.length === 0 ? (
                                                <div style={ui.empty}>No hay documentos en la biblioteca.</div>
                                            ) : (
                                                [...docs]
                                                    .sort((a, b) => safe(a.title).localeCompare(safe(b.title), "es", { sensitivity: "base" }))
                                                    .map((d) => {
                                                        const included = (selectedColeccion.documentIds || []).includes(d.id);
                                                        return (
                                                            <button
                                                                key={d.id}
                                                                type="button"
                                                                onClick={() => handleToggleDocInColeccion(d.id)}
                                                                style={{
                                                                    ...ui.coleccionDocItem,
                                                                    ...(included ? ui.coleccionDocItemActive : {}),
                                                                }}
                                                                disabled={coleccionBusy}
                                                            >
                                                                <div style={{
                                                                    ...ui.coleccionDocCheck,
                                                                    ...(included ? ui.coleccionDocCheckActive : {}),
                                                                }}>
                                                                    {included ? "✓" : ""}
                                                                </div>
                                                                <div style={ui.coleccionDocInfo}>
                                                                    <div style={ui.coleccionDocTitle}>{safe(d.title) || "Sin título"}</div>
                                                                    <div style={ui.coleccionDocMeta}>
                                                                        {safe(d.category) || "General"} · {formatBytes(d.size)}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })
                                            )}
                                        </div>

                                        {coleccionDocs.length > 0 && (
                                            <div style={ui.coleccionesIncludedSection}>
                                                <div style={ui.coleccionesIncludedTitle}>
                                                    Documentos incluidos ({coleccionDocs.length})
                                                </div>
                                                <div style={ui.coleccionesIncludedList}>
                                                    {coleccionDocs.map((d) => (
                                                        <div key={d.id} style={ui.coleccionesIncludedItem}>
                                                            <div style={ui.coleccionesIncludedIcon}>PDF</div>
                                                            <div style={ui.coleccionesIncludedName}>{safe(d.title)}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={ui.coleccionesEmptyRight}>
                                        <div style={ui.coleccionesEmptyIcon}>📁</div>
                                        <div style={ui.coleccionesEmptyTitle}>Seleccioná una colección</div>
                                        <div style={ui.coleccionesEmptyText}>
                                            Elegí una colección de la lista para ver y gestionar los documentos que contiene.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const ui = {
    shell: {
        height: "100vh",
        width: "100vw",
        background: "#F6F7FB",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        color: "#0F172A",
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "auto 1fr",
    },
    topbar: {
        height: 64,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #E7E9F2",
        background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(246,247,251,0.95) 100%)",
        backdropFilter: "blur(6px)",
    },
    brand: { display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" },
    brandMark: {
        width: 42,
        height: 42,
        borderRadius: 14,
        background: ACCENT,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 950,
        letterSpacing: 0.4,
        boxShadow: "0 12px 24px rgba(8,159,138,0.20)",
    },
    brandTitle: { fontWeight: 950, fontSize: 14 },
    brandSub: { fontWeight: 800, fontSize: 12, color: "#64748B" },
    topbarRight: { display: "flex", alignItems: "center", gap: 12 },
    kpi: {
        display: "grid",
        gap: 2,
        padding: "8px 12px",
        borderRadius: 14,
        border: "1px solid #E7E9F2",
        background: "#fff",
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
        minWidth: 140,
    },
    kpiLabel: { fontWeight: 850, fontSize: 12, color: "#64748B" },
    kpiValue: { fontWeight: 950, fontSize: 18, color: "#0F172A", lineHeight: 1.1 },
    btnGhost: {
        border: "1px solid #E7E9F2",
        background: "#fff",
        borderRadius: 14,
        padding: "10px 12px",
        cursor: "pointer",
        fontWeight: 950,
        color: "#0F172A",
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
        whiteSpace: "nowrap",
    },
    main: { overflow: "auto", padding: 16, display: "grid", placeItems: "start center" },
    container: { width: "min(1450px, 100%)", display: "grid", gap: 14 },
    heroCard: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 24,
        padding: 18,
        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
        display: "grid",
        gap: 16,
        alignItems: "center",
    },
    kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    kickerDot: { width: 10, height: 10, borderRadius: 999, background: ACCENT, boxShadow: "0 0 0 4px rgba(8,159,138,0.14)" },
    kicker: { fontSize: 12, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase", color: ACCENT },
    badge: {
        fontSize: 12,
        fontWeight: 950,
        padding: "6px 10px",
        borderRadius: 999,
        background: "#FFFFFF",
        border: "1px solid #E7E9F2",
        color: "#334155",
    },
    title: { margin: 0, fontSize: 28, fontWeight: 980, letterSpacing: -0.4 },
    subtitle: { margin: 0, color: "#64748B", fontWeight: 800, lineHeight: 1.5, maxWidth: 860 },
    heroStats: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
    },
    statCard: {
        border: "1px solid #E7E9F2",
        borderRadius: 20,
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
        padding: 16,
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
        minHeight: 92,
    },
    statLabel: { fontSize: 12, fontWeight: 900, color: "#64748B", marginBottom: 8 },
    statValue: { fontSize: 24, fontWeight: 980, color: "#0F172A" },

    contentGrid: {
        display: "grid",
        gridTemplateColumns: "minmax(320px, 560px) 1fr",
        gap: 14,
        alignItems: "start",
    },
    leftCol: { display: "grid", gap: 14 },
    rightCol: { minWidth: 0, overflow: "hidden" },

    panel: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 22,
        padding: 16,
        boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
        display: "grid",
        gap: 14,
    },
    panelHead: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        flexWrap: "wrap",
    },
    panelTitle: { fontWeight: 980, fontSize: 16, color: "#0F172A" },
    panelText: { marginTop: 4, color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.4 },

    formGrid: { display: "grid", gap: 12 },
    field: { display: "grid", gap: 8 },
    label: { fontWeight: 950, fontSize: 13, color: "#0F172A" },
    input: {
        width: "100%",
        borderRadius: 18,
        border: "1px solid #E7E9F2",
        background: "#FBFCFF",
        padding: "14px 14px",
        fontWeight: 900,
        color: "#0F172A",
        outline: "none",
        boxSizing: "border-box",
    },
    textarea: {
        width: "100%",
        minHeight: 110,
        resize: "vertical",
        borderRadius: 18,
        border: "1px solid #E7E9F2",
        background: "#FBFCFF",
        padding: "14px 14px",
        fontWeight: 800,
        color: "#0F172A",
        outline: "none",
        boxSizing: "border-box",
        fontFamily: "inherit",
    },

    uploadBox: {
        border: "1px dashed rgba(8,159,138,0.35)",
        background: "#F8FFFD",
        borderRadius: 20,
        padding: 16,
        display: "grid",
        gridTemplateColumns: "64px 1fr auto",
        gap: 14,
        alignItems: "center",
    },
    uploadIcon: {
        width: 64,
        height: 64,
        borderRadius: 18,
        background: ACCENT,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 980,
        boxShadow: "0 16px 28px rgba(8,159,138,0.18)",
    },
    uploadTitle: { fontWeight: 980, color: "#0F172A" },
    uploadText: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.35 },
    fileBadge: {
        display: "inline-flex",
        width: "fit-content",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(8,159,138,0.25)",
        background: "#F3FBF9",
        color: ACCENT,
        fontWeight: 950,
        fontSize: 12,
    },
    fileBtn: {
        borderRadius: 16,
        border: `1px solid ${ACCENT}`,
        background: "#fff",
        color: ACCENT,
        padding: "12px 14px",
        cursor: "pointer",
        fontWeight: 980,
        whiteSpace: "nowrap",
    },

    btnPrimary: {
        borderRadius: 18,
        border: `1px solid ${ACCENT}`,
        background: ACCENT,
        color: "#fff",
        padding: "14px 14px",
        fontWeight: 980,
        cursor: "pointer",
        boxShadow: "0 18px 32px rgba(8,159,138,0.22)",
        minHeight: 52,
    },
    btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },

    searchWrap: {
        display: "grid",
        gridTemplateColumns: "42px 1fr auto",
        alignItems: "center",
        gap: 10,
        borderRadius: 18,
        border: "1px solid #E7E9F2",
        background: "#FBFCFF",
        padding: "10px 10px",
    },
    searchIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        background: "rgba(15,23,42,0.06)",
        display: "grid",
        placeItems: "center",
        fontWeight: 950,
        color: "#0F172A",
    },
    searchInput: {
        border: "none",
        outline: "none",
        background: "transparent",
        fontWeight: 950,
        fontSize: 14,
        color: "#0F172A",
        padding: "10px 0",
    },
    clearBtn: {
        border: "1px solid #E7E9F2",
        background: "#fff",
        borderRadius: 14,
        width: 38,
        height: 38,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        fontWeight: 950,
        color: "#64748B",
    },

    categoryRow: { display: "flex", flexWrap: "wrap", gap: 8 },
    categoryChip: {
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid #E7E9F2",
        background: "#fff",
        color: "#334155",
        fontWeight: 950,
        fontSize: 12,
        cursor: "pointer",
    },

    docList: {
        display: "grid",
        gap: 10,
        maxHeight: "calc(100vh - 420px)",
        overflow: "auto",
        paddingRight: 4,
    },
    docRow: {
        width: "100%",
        border: "1px solid #E7E9F2",
        background: "#fff",
        borderRadius: 18,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "56px 1fr",
        gap: 12,
        textAlign: "left",
        cursor: "pointer",
        boxSizing: "border-box",
    },
    docRowActive: {
        border: "1px solid rgba(8,159,138,0.35)",
        background: "#F8FFFD",
        boxShadow: "0 12px 24px rgba(8,159,138,0.10)",
    },
    docIcon: {
        width: 56,
        height: 56,
        borderRadius: 16,
        background: ACCENT,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 980,
        fontSize: 12,
        letterSpacing: 0.5,
    },
    docInfo: { display: "grid", gap: 8, minWidth: 0 },
    docTitle: { fontWeight: 980, color: "#0F172A" },
    docMeta: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
    docChip: {
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(8,159,138,0.30)",
        background: "#F3FBF9",
        color: ACCENT,
        fontWeight: 950,
        fontSize: 12,
    },
    docMetaText: { color: "#64748B", fontWeight: 850, fontSize: 12 },
    docDesc: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.4 },

    viewerPanel: {
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 22,
        overflow: "hidden",
        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
        display: "grid",
        gridTemplateRows: "auto auto 1fr auto",
        minHeight: "calc(100vh - 175px)",
        alignSelf: "start",
    },
    viewerHead: {
        padding: 16,
        borderBottom: "1px solid #EEF1F7",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    viewerTitle: { fontWeight: 980, fontSize: 16, color: "#0F172A" },
    viewerSub: { color: "#64748B", fontWeight: 800, fontSize: 13, marginTop: 4 },
    viewerBody: {
        background: "#F8FAFC",
        minHeight: 0,
        display: "grid",
    },
    iframe: {
        width: "100%",
        height: "100%",
        minHeight: "calc(100vh - 310px)",
        border: "none",
        background: "#fff",
    },
    viewerEmpty: {
        minHeight: "calc(100vh - 310px)",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: 30,
        gap: 12,
    },
    viewerEmptyIcon: {
        width: 84,
        height: 84,
        borderRadius: 24,
        background: ACCENT,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 980,
        boxShadow: "0 16px 28px rgba(8,159,138,0.18)",
    },
    viewerEmptyTitle: { fontWeight: 980, color: "#0F172A", fontSize: 18 },
    viewerEmptyText: { color: "#64748B", fontWeight: 800, maxWidth: 420, lineHeight: 1.45 },

    viewerFooter: {
        padding: 16,
        borderTop: "1px solid #EEF1F7",
        background: "#fff",
    },
    viewerFooterTitle: { fontWeight: 980, color: "#0F172A", marginBottom: 6 },
    viewerFooterText: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.45 },

    pdfBtn: {
        borderRadius: 16,
        border: `1px solid ${ACCENT}`,
        background: ACCENT,
        color: "#fff",
        padding: "10px 12px",
        cursor: "pointer",
        fontWeight: 980,
        boxShadow: "0 14px 26px rgba(8,159,138,0.18)",
        whiteSpace: "nowrap",
        textDecoration: "none",
    },

    errBox: {
        borderRadius: 18,
        border: "1px solid rgba(239,68,68,0.35)",
        background: "#FFF6F6",
        padding: 12,
        fontWeight: 900,
        color: "#0F172A",
    },
    empty: { padding: 14, color: "#64748B", fontWeight: 850, fontSize: 13 },

    heroActionBtn: {
        width: 42,
        height: 42,
        border: "1px solid #089F8A",
        background: "linear-gradient(180deg, #0AA791 0%, #089F8A 100%)",
        color: "#fff",
        borderRadius: 12,
        padding: 0,
        display: "grid",
        placeItems: "center",
        fontWeight: 980,
        cursor: "pointer",
        boxShadow: "0 4px 14px rgba(8,159,138,0.24)",
    },

    heroActionIcon: {
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "rgba(255,255,255,0.18)",
        display: "grid",
        placeItems: "center",
        fontWeight: 980,
        lineHeight: 1,
    },

    quickInfoGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
    },

    quickInfoCard: {
        border: "1px solid #E7E9F2",
        borderRadius: 18,
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
        padding: "14px 16px",
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
        minHeight: 108,
        display: "grid",
        alignContent: "start",
        gap: 4,
    },

    quickInfoLabel: {
        fontSize: 11,
        fontWeight: 950,
        color: "#64748B",
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },

    quickInfoValue: {
        fontSize: 17,
        fontWeight: 980,
        color: "#0F172A",
        marginBottom: 0,
    },

    quickInfoText: {
        color: "#64748B",
        fontWeight: 800,
        fontSize: 13,
        lineHeight: 1.45,
    },

    modalBackdrop: {
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.42)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 9999,
    },

    modalCard: {
        width: "min(760px, 100%)",
        maxHeight: "90vh",
        overflow: "auto",
        background: "#fff",
        border: "1px solid rgba(231,233,242,0.9)",
        borderRadius: 28,
        boxShadow: "0 30px 80px rgba(15,23,42,0.28)",
    },

    modalHeader: {
        padding: 20,
        borderBottom: "1px solid #EEF1F7",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
    },

    modalKicker: {
        fontSize: 12,
        fontWeight: 980,
        color: "#089F8A",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 8,
    },

    modalTitle: {
        fontSize: 24,
        fontWeight: 980,
        color: "#0F172A",
        marginBottom: 6,
    },

    modalText: {
        color: "#64748B",
        fontWeight: 800,
        lineHeight: 1.45,
        maxWidth: 560,
    },

    modalCloseBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        border: "1px solid #E7E9F2",
        background: "#fff",
        color: "#64748B",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        fontWeight: 980,
        flex: "0 0 auto",
    },

    modalForm: {
        display: "grid",
        gap: 18,
        padding: 20,
    },

    modalFooter: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 12,
        paddingTop: 4,
    },

    btnSecondary: {
        borderRadius: 18,
        border: "1px solid #E7E9F2",
        background: "#fff",
        color: "#0F172A",
        padding: "14px 16px",
        fontWeight: 980,
        cursor: "pointer",
        minHeight: 52,
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    },

    viewerSectionTitleWrap: {
        padding: "18px 0 12px 0",
        borderBottom: "1px solid #EEF1F7",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFE 100%)",
        display: "flex",
        justifyContent: "center",
    },

    viewerSectionKicker: {
        fontSize: 11,
        fontWeight: 950,
        color: "#089F8A",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 6,
    },

    viewerSectionTitle: {
        fontSize: 20,
        fontWeight: 980,
        color: "#0F172A",
        lineHeight: 1.1,
    },
    viewerSectionTitleInner: {
        width: "100%",
        maxWidth: "calc(100% - 36px)",
    },
    viewerDocUid: {
        fontSize: 11,
        fontWeight: 850,
        color: "#94A3B8",
        marginTop: 6,
        fontFamily: "monospace",
        letterSpacing: 0.3,
    },

    viewerExpandBtn: {
        width: 52,
        height: 52,
        borderRadius: 16,
        border: "1px solid rgba(8,159,138,0.22)",
        background: "linear-gradient(180deg, #0AA791 0%, #089F8A 100%)",
        color: "#fff",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        boxShadow: "0 16px 28px rgba(8,159,138,0.20)",
        flex: "0 0 auto",
    },

    viewerExpandIcon: {
        fontSize: 22,
        lineHeight: 1,
        fontWeight: 980,
    },

    viewerHeadActions: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },

    viewerUpdateBtn: {
        width: 42,
        height: 42,
        borderRadius: 12,
        border: "1px solid rgba(8,159,138,0.22)",
        background: "#F3FBF9",
        color: ACCENT,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(8,159,138,0.10)",
        flex: "0 0 auto",
    },

    viewerDeleteBtn: {
        width: 42,
        height: 42,
        borderRadius: 12,
        border: "1px solid rgba(239,68,68,0.25)",
        background: "#FFF6F6",
        color: "#EF4444",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(239,68,68,0.08)",
        flex: "0 0 auto",
    },

    viewerActionIcon: {
        fontSize: 16,
        lineHeight: 1,
        fontWeight: 980,
    },

    updateModalCard: {
        width: "min(620px, 100%)",
        maxHeight: "90vh",
        overflow: "auto",
        background: "#fff",
        border: "1px solid rgba(231,233,242,0.9)",
        borderRadius: 28,
        boxShadow: "0 30px 80px rgba(15,23,42,0.28)",
    },

    updateModalBody: {
        padding: 20,
        display: "grid",
        gap: 16,
    },

    updateModalFooter: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 12,
        padding: "0 20px 20px",
    },

    updateDocInfo: {
        padding: 14,
        borderRadius: 18,
        border: "1px solid #E7E9F2",
        background: "#FBFCFF",
        display: "grid",
        gap: 6,
    },

    updateDocInfoLabel: {
        fontSize: 11,
        fontWeight: 950,
        color: "#64748B",
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },

    updateDocInfoTitle: {
        fontWeight: 980,
        fontSize: 15,
        color: "#0F172A",
    },

    updateDocInfoMeta: {
        fontSize: 12,
        fontWeight: 850,
        color: "#64748B",
    },

    viewerModalBackdrop: {
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.58)",
        backdropFilter: "blur(10px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 10000,
    },

    viewerModalCard: {
        width: "min(1400px, 96vw)",
        height: "min(92vh, 980px)",
        background: "#fff",
        border: "1px solid rgba(231,233,242,0.92)",
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: "0 32px 90px rgba(15,23,42,0.34)",
        display: "grid",
        gridTemplateRows: "88px 1fr",
        position: "relative",
        zIndex: 10001,
    },

    viewerModalHeader: {
        padding: "12px 16px",
        borderBottom: "1px solid #EEF1F7",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 84,
    },

    viewerModalKicker: {
        fontSize: 10,
        fontWeight: 980,
        color: "#089F8A",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 4,
    },

    viewerModalTitle: {
        fontSize: 18,
        fontWeight: 980,
        color: "#0F172A",
        lineHeight: 1.1,
        marginBottom: 2,
    },

    viewerModalMeta: {
        color: "#64748B",
        fontWeight: 850,
        fontSize: 12,
    },

    viewerModalCloseBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        border: "1px solid #E7E9F2",
        background: "#fff",
        color: "#64748B",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        fontWeight: 980,
        fontSize: 16,
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    },

    viewerModalActions: {
        display: "flex",
        alignItems: "center",
        gap: 10,
    },

    viewerModalBody: {
        background: "#F8FAFC",
        minHeight: 0,
        padding: 0,
    },

    viewerModalIframe: {
        width: "100%",
        height: "100%",
        border: "none",
        background: "#fff",
    },

    viewerHelpBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        border: "1px solid rgba(8,159,138,0.22)",
        background: "#F3FBF9",
        color: "#089F8A",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        fontWeight: 980,
        fontSize: 18,
        boxShadow: "0 10px 24px rgba(8,159,138,0.10)",
    },

    viewerHelpOverlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.18)",
        backdropFilter: "blur(2px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        zIndex: 10050,
    },

    viewerHelpCard: {
        width: 360,
        maxWidth: "calc(100vw - 48px)",
        background: "#fff",
        border: "1px solid #E7E9F2",
        borderRadius: 22,
        boxShadow: "0 24px 60px rgba(15,23,42,0.20)",
        padding: 18,
        display: "grid",
        gap: 10,
        position: "relative",
        zIndex: 10051,
    },

    viewerHelpKicker: {
        fontSize: 11,
        fontWeight: 980,
        color: "#089F8A",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },

    viewerHelpTitle: {
        fontSize: 18,
        fontWeight: 980,
        color: "#0F172A",
        lineHeight: 1.15,
    },

    viewerHelpText: {
        color: "#475569",
        fontWeight: 800,
        fontSize: 14,
        lineHeight: 1.5,
    },

    viewerHelpNote: {
        color: "#64748B",
        fontWeight: 800,
        fontSize: 13,
        lineHeight: 1.45,
        padding: 12,
        borderRadius: 16,
        background: "#F8FAFC",
        border: "1px solid #EEF1F7",
    },

    viewerHelpFooter: {
        display: "flex",
        justifyContent: "flex-end",
        marginTop: 4,
    },

    viewerHelpOkBtn: {
        borderRadius: 14,
        border: "1px solid #089F8A",
        background: "#089F8A",
        color: "#fff",
        padding: "10px 14px",
        fontWeight: 980,
        cursor: "pointer",
        boxShadow: "0 14px 28px rgba(8,159,138,0.18)",
    },

    panelActions: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "flex-end",
    },

    searchToggleBtn: {
        width: 42,
        height: 42,
        border: "1px solid #E7E9F2",
        background: "#fff",
        color: "#0F172A",
        borderRadius: 12,
        padding: 0,
        display: "grid",
        placeItems: "center",
        fontWeight: 950,
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(15,23,42,0.05)",
    },

    searchToggleBtnActive: {
        border: "1px solid rgba(8,159,138,0.30)",
        background: "#F3FBF9",
        color: ACCENT,
    },

    searchToggleIcon: {
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "rgba(8,159,138,0.10)",
        display: "grid",
        placeItems: "center",
        fontWeight: 980,
        lineHeight: 1,
    },

    // Colecciones styles
    coleccionesBtn: {
        width: 42,
        height: 42,
        border: "1px solid #E7E9F2",
        background: "#fff",
        color: "#0F172A",
        borderRadius: 12,
        padding: 0,
        display: "grid",
        placeItems: "center",
        fontWeight: 950,
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(15,23,42,0.05)",
    },
    coleccionesBtnIcon: {
        fontSize: 16,
        lineHeight: 1,
    },
    coleccionesModalCard: {
        width: "min(1100px, 96vw)",
        maxHeight: "90vh",
        background: "#fff",
        border: "1px solid rgba(231,233,242,0.9)",
        borderRadius: 28,
        boxShadow: "0 30px 80px rgba(15,23,42,0.28)",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        overflow: "hidden",
    },
    coleccionesModalHeader: {
        padding: 20,
        borderBottom: "1px solid #EEF1F7",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
    },
    coleccionesBody: {
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        minHeight: 0,
        overflow: "hidden",
    },
    coleccionesLeft: {
        borderRight: "1px solid #EEF1F7",
        display: "grid",
        gridTemplateRows: "auto auto auto 1fr",
        gap: 0,
        overflow: "hidden",
    },
    coleccionesLeftHead: {
        padding: "14px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #EEF1F7",
    },
    coleccionesLeftTitle: {
        fontWeight: 980,
        fontSize: 14,
        color: "#0F172A",
    },
    coleccionesAddBtn: {
        border: "1px solid " + ACCENT,
        background: "#F3FBF9",
        color: ACCENT,
        borderRadius: 12,
        padding: "8px 12px",
        fontWeight: 980,
        fontSize: 12,
        cursor: "pointer",
        whiteSpace: "nowrap",
    },
    coleccionesNewForm: {
        padding: 14,
        borderBottom: "1px solid #EEF1F7",
        display: "grid",
        gap: 10,
        background: "#FBFCFF",
    },
    coleccionesNewInput: {
        width: "100%",
        borderRadius: 12,
        border: "1px solid #E7E9F2",
        background: "#fff",
        padding: "10px 12px",
        fontWeight: 900,
        fontSize: 13,
        color: "#0F172A",
        outline: "none",
        boxSizing: "border-box",
    },
    coleccionesNewActions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
    },
    coleccionesNewCancelBtn: {
        border: "1px solid #E7E9F2",
        background: "#fff",
        color: "#64748B",
        borderRadius: 10,
        padding: "8px 12px",
        fontWeight: 950,
        fontSize: 12,
        cursor: "pointer",
    },
    coleccionesNewSaveBtn: {
        border: "1px solid " + ACCENT,
        background: ACCENT,
        color: "#fff",
        borderRadius: 10,
        padding: "8px 14px",
        fontWeight: 980,
        fontSize: 12,
        cursor: "pointer",
    },
    coleccionesList: {
        overflow: "auto",
        padding: "8px 0",
    },
    coleccionRow: {
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        margin: "0 8px",
        borderRadius: 14,
        transition: "background 0.15s",
    },
    coleccionRowActive: {
        background: "#F3FBF9",
        border: "1px solid rgba(8,159,138,0.20)",
    },
    coleccionRowBtn: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 8px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        borderRadius: 12,
    },
    coleccionRowIcon: {
        fontSize: 20,
        lineHeight: 1,
    },
    coleccionRowInfo: {
        display: "grid",
        gap: 2,
        minWidth: 0,
    },
    coleccionRowName: {
        fontWeight: 980,
        fontSize: 13,
        color: "#0F172A",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    coleccionRowMeta: {
        fontSize: 11,
        fontWeight: 850,
        color: "#64748B",
    },
    coleccionDeleteBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        border: "1px solid #E7E9F2",
        background: "#fff",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        fontSize: 14,
        flex: "0 0 auto",
    },
    coleccionesRight: {
        padding: 20,
        overflow: "auto",
        display: "grid",
        alignContent: "start",
        gap: 14,
    },
    coleccionesRightHead: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
    },
    coleccionesRightTitle: {
        fontWeight: 980,
        fontSize: 18,
        color: "#0F172A",
    },
    coleccionesRightDesc: {
        color: "#64748B",
        fontWeight: 800,
        fontSize: 13,
        marginTop: 4,
    },
    coleccionesRightBadge: {
        padding: "6px 12px",
        borderRadius: 999,
        border: "1px solid rgba(8,159,138,0.25)",
        background: "#F3FBF9",
        color: ACCENT,
        fontWeight: 980,
        fontSize: 12,
        whiteSpace: "nowrap",
    },
    coleccionesRightSubtitle: {
        color: "#64748B",
        fontWeight: 850,
        fontSize: 13,
    },
    coleccionesDocGrid: {
        display: "grid",
        gap: 8,
        maxHeight: "calc(90vh - 340px)",
        overflow: "auto",
        paddingRight: 4,
    },
    coleccionDocItem: {
        width: "100%",
        border: "1px solid #E7E9F2",
        background: "#fff",
        borderRadius: 14,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        cursor: "pointer",
        boxSizing: "border-box",
    },
    coleccionDocItemActive: {
        border: "1px solid rgba(8,159,138,0.35)",
        background: "#F8FFFD",
    },
    coleccionDocCheck: {
        width: 28,
        height: 28,
        borderRadius: 8,
        border: "2px solid #E7E9F2",
        background: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 980,
        fontSize: 14,
        color: "transparent",
        flex: "0 0 auto",
    },
    coleccionDocCheckActive: {
        border: "2px solid " + ACCENT,
        background: ACCENT,
        color: "#fff",
    },
    coleccionDocInfo: {
        display: "grid",
        gap: 2,
        minWidth: 0,
    },
    coleccionDocTitle: {
        fontWeight: 950,
        fontSize: 13,
        color: "#0F172A",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    coleccionDocMeta: {
        fontSize: 11,
        fontWeight: 850,
        color: "#64748B",
    },
    coleccionesIncludedSection: {
        borderTop: "1px solid #EEF1F7",
        paddingTop: 14,
        display: "grid",
        gap: 10,
    },
    coleccionesIncludedTitle: {
        fontWeight: 980,
        fontSize: 13,
        color: ACCENT,
    },
    coleccionesIncludedList: {
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
    },
    coleccionesIncludedItem: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(8,159,138,0.25)",
        background: "#F3FBF9",
    },
    coleccionesIncludedIcon: {
        fontSize: 10,
        fontWeight: 980,
        color: ACCENT,
    },
    coleccionesIncludedName: {
        fontSize: 12,
        fontWeight: 950,
        color: "#0F172A",
        maxWidth: 180,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    coleccionesEmptyRight: {
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: 40,
        gap: 12,
        alignSelf: "center",
    },
    coleccionesEmptyIcon: {
        fontSize: 48,
        lineHeight: 1,
    },
    coleccionesEmptyTitle: {
        fontWeight: 980,
        fontSize: 16,
        color: "#0F172A",
    },
    coleccionesEmptyText: {
        color: "#64748B",
        fontWeight: 800,
        fontSize: 13,
        maxWidth: 320,
        lineHeight: 1.45,
    },
};