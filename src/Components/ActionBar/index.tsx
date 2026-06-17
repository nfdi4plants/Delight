
type ActionBarItem = 
| {type: "button", label: string, onClick: () => void, icon: string, color?: "btn-primary" | "btn-secondary" | "btn-ghost"}
| {type: "title", label: string}

type ActionBarProps = {
    items: ActionBarItem[]
    itemsTrailing?: ActionBarItem[]
}

function Button({label, onClick, icon, color = "btn-primary"}: {label: string, onClick: () => void, icon: string, color?: "btn-primary" | "btn-secondary" | "btn-ghost"}) {
    return (
        <button 
            className={`btn ${color} btn-sm btn-square`} 
            onClick={onClick}
            title={label}
            aria-label={label}
        >
            <i className={`iconify ${icon} size-5`}/>
        </button>
    )
}

function Title({label}: {label: string}) {
    return (
        <h1 className="text-2xl font-bold">{label}</h1>
    )
}

function ActionBarItemComponent({item}: {item: ActionBarItem}) {
    if (item.type === "button") {
        return <Button label={item.label} onClick={item.onClick} icon={item.icon} color={item.color} />
    } else if (item.type === "title") {
        return <Title label={item.label} />
    } else {
        return null
    }
}

export default function ActionBar({ items, itemsTrailing }: ActionBarProps) {
    return (
        <div className="flex items-center gap-2 p-2">
            {items.map((item, index) => <ActionBarItemComponent key={index} item={item} />)}
            <div className="ml-auto flex items-center gap-2">
                {itemsTrailing?.map((item, index) => <ActionBarItemComponent key={index} item={item} />)}
            </div>
        </div>
    )
}