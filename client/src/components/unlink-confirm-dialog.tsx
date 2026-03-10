import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRM_WORD = "REMOVE";

interface UnlinkConfirmDialogProps {
  open: boolean;
  institutionName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function UnlinkConfirmDialog({
  open,
  institutionName,
  onConfirm,
  onClose,
}: UnlinkConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!open) setConfirmText("");
  }, [open]);

  const isConfirmed = confirmText === CONFIRM_WORD;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlink {institutionName}?</DialogTitle>
          <DialogDescription>
            This will revoke data-access consent and disconnect all accounts from{" "}
            <strong>{institutionName}</strong>. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="unlink-confirm-input">
            Type <strong>{CONFIRM_WORD}</strong> to confirm
          </Label>
          <Input
            id="unlink-confirm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!isConfirmed}
            onClick={onConfirm}
          >
            Unlink Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
