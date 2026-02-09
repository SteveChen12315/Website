import os
import json

# 配置路径
BASE_DIR = r'C:\Website\Gallery'
OUTPUT_FILE = r'C:\Website\gallery_data.js'

def generate_data():
    gallery_data = []
    
    # 遍历 Gallery 目录下所有文件夹
    for folder_name in os.listdir(BASE_DIR):
        folder_path = os.path.join(BASE_DIR, folder_name)
        
        if os.path.isdir(folder_path) and folder_name.startswith('Topic'):
            txt_path = os.path.join(folder_path, 'Description.txt')
            content = ""
            
            if os.path.exists(txt_path):
                # 读取 txt 内容，支持 utf-8
                with open(txt_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            
            gallery_data.append({
                "folder": folder_name,
                "content": content
            })

    # 将数据写入 JS 文件
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(f"const galleryData = {json.dumps(gallery_data, ensure_ascii=False, indent=4)};")
    
    print(f"成功更新！检测到 {len(gallery_data)} 个主题文件夹。")

if __name__ == "__main__":
    generate_data()