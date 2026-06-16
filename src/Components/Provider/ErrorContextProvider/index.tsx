import { useContext, useState } from "react";
import { ErrorContext } from "../../../Contexts/ErrorContext";
import BaseModal from "../../BaseModal";

function ErrorModal() {
    const { error, setError } = useContext(ErrorContext);
    const isOpen = error !== null;

    return (
        <BaseModal 
            isOpen={isOpen} 
            onClose={() => setError(null)} 
            title="Error" 
            classNames={{ title: "text-error" }}>
            {error}
        </BaseModal>
    )
}

export default function ErrorContextProvider({ children }: { children: React.ReactNode }) {
    const [error, setError] = useState<string | null>(null);

    return (
        <ErrorContext value={{ error, setError }}>
            <ErrorModal />
            {children}
        </ErrorContext>
    );
}