import {createContext, useContext} from "react";

export type ErrorContextType = {
    error: string | null,
    setError: (error: string | null) => void
}

export const ErrorContext = createContext<ErrorContextType>({
    error: null,
    setError: () => {}
});

export const useErrorContext = () => useContext(ErrorContext);

export default useErrorContext