import {createPortal} from "react-dom";

type BaseModalProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    classNames?: {
        modal?: string;
        modalBox?: string;
        title?: string;
    }
}

export default function BaseModal({isOpen, onClose, title, children, classNames}: BaseModalProps) {
    return (
        createPortal(
            <dialog className={`modal ${isOpen ? "modal-open" : ""} ${classNames?.modal || ""}`}>
                <div className={`modal-box ${classNames?.modalBox || ""}`}>
                    <h3 className={`text-lg font-bold ${classNames?.title || ""}`}>{title}</h3>
                    <div className="py-4">{children}</div>
                    <div className="modal-action">
                        <form method="dialog">
                            <button className="btn" onClick={onClose}>Close</button>
                        </form>
                    </div>
                </div>
            </dialog>,
            document.body
        )
    )
}