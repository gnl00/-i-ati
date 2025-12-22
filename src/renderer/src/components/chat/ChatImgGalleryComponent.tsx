import { Cross1Icon } from "@radix-ui/react-icons"
import { cn } from "@renderer/lib/utils"
import { useChatStore } from '@renderer/store'
import React, { useState } from 'react'

interface ImageGalleryProps { }

const ImageGalleryComponent: React.FC<ImageGalleryProps> = () => {
    const [iptImgHoverIndex, setIptImgHoverIndex] = useState(-1)
    const { imageSrcBase64List, setImageSrcBase64List } = useChatStore()
    const onInputImgDelClick = (_e: any, delIndex: number): void => {
        setImageSrcBase64List(imageSrcBase64List.filter((_, index) => index != delIndex))
    }
    return (
        imageSrcBase64List.length > 0 ? (
            <div className="max-w-full h-full flex overflow-x-scroll scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200">
                {imageSrcBase64List.map((imgItem, index) => (
                    <div
                        key={index}
                        className="h-full min-w-[10rem] relative"
                        onMouseOver={_ => { setIptImgHoverIndex(index) }}
                        onMouseLeave={_ => { setIptImgHoverIndex(-1) }}
                    >
                        <img className={cn(
                            "h-full w-full p-0.5 object-cover backdrop-blur rounded-md",
                            "transition-transform duration-300 ease-in-out",
                            "hover:scale-110"
                        )}
                            src={imgItem as string} />
                        {
                            iptImgHoverIndex === index && <div onClick={e => onInputImgDelClick(e, index)} className="transition-all duration-300 ease-in-out absolute top-1 right-1">
                                <Cross1Icon className="rounded-full bg-red-500 text-white p-1 w-5 h-5 transition-all duration-300 ease-in-out hover:transform hover:rotate-180" />
                            </div>
                        }
                    </div>
                ))}
            </div>
        ) : <></>
    )
}

export default ImageGalleryComponent