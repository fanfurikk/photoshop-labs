export function setupModal(dialog, { onClose } = {}) {
  let backdropDown = false;

  dialog.addEventListener("mousedown", (e) => {
    backdropDown = e.target === dialog;
  });

  dialog.addEventListener("mouseup", (e) => {
    const was = backdropDown;
    backdropDown = false;
    if (was && e.target === dialog && onClose) onClose();
  });

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (onClose) onClose();
  });
}

export function openModal(dialog) {
  if (!dialog.open) dialog.showModal();
}

export function closeModal(dialog) {
  if (dialog.open) dialog.close();
}
