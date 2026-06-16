import usePageStateContext, {type PageState} from "../../Contexts/PageContext"

export default function BackButton({ targetPage, beforePageChange }: { targetPage: PageState, beforePageChange?: () => void }) {
    const { setPage } = usePageStateContext();
    return(
        <button 
            className="btn btn-sm btn-square btn-primary" 
            onClick={() => {
                if (beforePageChange) beforePageChange();
                setPage(targetPage);
            }}
            title={`Back to ${targetPage}`}
            aria-label={`Back to ${targetPage}`}
        >
            <i className="iconify mdi--arrow-left-bold-box-outline size-5"></i>
        </button>
    )
}