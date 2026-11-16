import struct,zlib,binascii
from collections import Counter
def decode(file):
 data=file.read_bytes();offset=8;palette=None;alpha=b'';packed=b''
 while offset<len(data):
  length=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8];value=data[offset+8:offset+8+length];offset+=12+length
  if kind==b'IHDR':w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',value)
  elif kind==b'PLTE':palette=[tuple(value[i:i+3]) for i in range(0,len(value),3)]
  elif kind==b'tRNS':alpha=value
  elif kind==b'IDAT':packed+=value
 assert depth==8 and color in (3,6) and interlace==0
 bpp=1 if color==3 else 4;stride=w*bpp;raw=zlib.decompress(packed);previous=bytearray(stride);rows=[]
 for y in range(h):
  f=raw[y*(stride+1)];row=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
  for x in range(stride):
   a=row[x-bpp] if x>=bpp else 0;b=previous[x];c=previous[x-bpp] if x>=bpp else 0
   if f==1:v=a
   elif f==2:v=b
   elif f==3:v=(a+b)//2
   elif f==4:
    p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c);v=a if pa<=pb and pa<=pc else b if pb<=pc else c
   else:assert f==0;v=0
   row[x]=(row[x]+v)&255
  rows.append(row);previous=row
 if color==3:pixels=[(*palette[i],alpha[i] if i<len(alpha) else 255) for row in rows for i in row]
 else:pixels=[tuple(row[i:i+4]) for row in rows for i in range(0,len(row),4)]
 return w,h,pixels
def png(w,h,pixels):
 def chunk(kind,value):return struct.pack('>I',len(value))+kind+value+struct.pack('>I',binascii.crc32(kind+value)&0xffffffff)
 raw=b''.join(b'\0'+bytes(c for pixel in pixels[y*w:(y+1)*w] for c in pixel) for y in range(h))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
