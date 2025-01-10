import React from 'react';
import { cn } from "@renderer/lib/utils";
import { Cross1Icon } from "@radix-ui/react-icons";
import { useChatContext } from '@renderer/context/ChatContext';

interface ImageGalleryCompProps {
    iptImgHoverIndex: number | null;
    onInputImgMouseOver: (e: React.MouseEvent<HTMLDivElement>, index: number) => void;
    onInputImgMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const ImageGalleryComp: React.FC<ImageGalleryCompProps> = ({
    iptImgHoverIndex,
    onInputImgMouseOver,
    onInputImgMouseLeave
}) => {
  const {imageSrcBase64List, setImageSrcBase64List} = useChatContext()
  const onInputImgDelClick = (_, delIndex) => {
    setImageSrcBase64List(imageSrcBase64List.filter((_, index) => index != delIndex))
  }
  return (
      imageSrcBase64List.length > 0 ? (
          <div className="h-1/6 max-w-full absolute bottom-0 left-1 flex overflow-x-scroll scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200">
              {imageSrcBase64List.map((imgItem, index) => (
                  <div 
                      key={index} 
                      className="h-full min-w-[10rem] relative"
                      onMouseOver={e => onInputImgMouseOver(e, index)}
                      onMouseLeave={onInputImgMouseLeave}
                  >
                      <img className={cn(
                          "h-full w-full p-0.5 object-cover backdrop-blur",
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
  );
};

export default ImageGalleryComp;