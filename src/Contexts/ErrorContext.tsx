import {createContext, useState, useContext} from "react";
import {createPortal} from "react-dom";

export type ErrorContextType = {
    error: string | null,
    setError: (error: string | null) => void
}

export const ErrorContext = createContext<ErrorContextType>({
    error: null,
    setError: () => {}
});


function ErrorModal() {
    const {error, setError} = useContext(ErrorContext);

    return (
        createPortal(
            <dialog className={`modal ${error ? "modal-open" : ""}`}>
                <div className="modal-box">
                    <h3 className="text-lg font-bold text-error">Error</h3>
                    <p className="py-4">{error}</p>
                    <div className="modal-action">
                        <form method="dialog">
                            <button className="btn" onClick={() => setError(null)}>Close</button>
                        </form>
                    </div>
                </div>
            </dialog>,
            document.body
        )
    )
}

export default function ErrorContextProvider({children}: {children: React.ReactNode}) {
    const [error, setError] = useState<string | null>(null);
    
    return (
        <ErrorContext value={{error, setError}}>
            <ErrorModal />
            {children}
        </ErrorContext>
    );
}