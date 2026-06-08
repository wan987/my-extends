// 自定义静态资源的路径
window.externalPublicPath = './dist/'
// 接管应用
window.takeOverApp = false

// 移除统计脚本（51.la），避免CSP错误
// 如果需要统计功能，可以后续添加

const getDataFromBackend = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve({
        mindMapData: {
          root: {
            data: {
              text: '根节点'
            },
            children: []
          },
          theme: {
            template: 'avocado',
            config: {}
          },
          layout: 'logicalStructure',
          config: {},
          view: null
        },
        mindMapConfig: {},
        lang: 'zh',
        localConfig: null
      })
    }, 200)
  })
}

const setTakeOverAppMethods = data => {
  window.takeOverAppMethods = {}
  // 获取思维导图数据的函数
  window.takeOverAppMethods.getMindMapData = () => {
    return data.mindMapData
  }
  // 保存思维导图数据的函数
  window.takeOverAppMethods.saveMindMapData = data => {
    console.log(data)
  }
  // 获取思维导图配置，也就是实例化时会传入的选项
  window.takeOverAppMethods.getMindMapConfig = () => {
    return data.mindMapConfig
  }
  // 保存思维导图配置
  window.takeOverAppMethods.saveMindMapConfig = config => {
    console.log(config)
  }
  // 获取语言的函数
  window.takeOverAppMethods.getLanguage = () => {
    return data.lang
  }
  // 保存语言的函数
  window.takeOverAppMethods.saveLanguage = lang => {
    console.log(lang)
  }
  // 获取本地配置的函数
  window.takeOverAppMethods.getLocalConfig = () => {
    return data.localConfig
  }
  // 保存本地配置的函数
  window.takeOverAppMethods.saveLocalConfig = config => {
    console.log(config)
  }
}

// 存储从父页面接收的数据
let receivedData = null

// 监听来自父页面的消息
window.addEventListener('message', (event) => {
  // 验证消息来源（应该是扩展的 origin）
  // 注意：在扩展环境中，origin 可能是 chrome-extension://[扩展ID]
  if (!event.data || event.data.type !== 'BOOKMARK_DATA') {
    return
  }
  
  console.log('收到来自父页面的书签数据:', event.data)
  
  // 保存接收到的数据
  receivedData = event.data.data
  
  // 设置接管模式
  window.takeOverApp = true
  
  // 更新 takeOverAppMethods 返回的数据
  if (window.takeOverAppMethods) {
    // 如果方法已经设置，更新 getMindMapData
    window.takeOverAppMethods.getMindMapData = () => {
      return receivedData ? receivedData.mindMapData : null
    }
    window.takeOverAppMethods.getMindMapConfig = () => {
      return receivedData ? receivedData.mindMapConfig : {}
    }
    window.takeOverAppMethods.getLanguage = () => {
      return receivedData ? receivedData.lang : 'zh'
    }
    window.takeOverAppMethods.getLocalConfig = () => {
      return receivedData ? receivedData.localConfig : null
    }
  } else {
    // 如果方法还未设置，先设置方法
    setTakeOverAppMethods(receivedData || {
      mindMapData: {
        root: {
          data: { text: '书签' },
          children: []
        },
        theme: { template: 'classic4', config: {} },
        layout: 'logicalStructure',
        config: {},
        view: null
      },
      mindMapConfig: {},
      lang: 'zh',
      localConfig: null
    })
  }
  
  // 如果应用已经初始化，需要重新加载数据
  if (window.$bus && window.$bus.$emit) {
    // 触发数据更新事件（如果应用支持）
    window.$bus.$emit('data_updated', receivedData)
  }
})

window.onload = async () => {
  // 如果已经收到数据，使用接收到的数据
  if (receivedData) {
    window.takeOverApp = true
    setTakeOverAppMethods(receivedData)
  } else if (window.takeOverApp) {
    // 否则使用默认数据
    const data = await getDataFromBackend()
    setTakeOverAppMethods(data)
  } else {
    // 不在接管模式，正常初始化
    return
  }
  
  // 思维导图实例创建完成事件
  if (window.$bus) {
    window.$bus.$on('app_inited', mindMap => {
      console.log('思维导图应用已初始化:', mindMap)
      
      // 监听节点点击事件
      if (mindMap && mindMap.on) {
        mindMap.on('node_click', (node, e) => {
          // 获取节点数据
          const nodeData = node.getData()
          
          // 如果节点有 url（书签节点），发送消息给父页面打开链接
          if (nodeData && nodeData.url) {
            window.parent.postMessage({
              type: 'OPEN_BOOKMARK',
              data: {
                url: nodeData.url,
                bookmarkId: nodeData.bookmarkId,
                title: nodeData.text
              }
            }, '*')
            console.log('发送打开书签消息:', nodeData.url)
          }
        })
        
        console.log('已绑定节点点击事件监听器')
      }
    })
  }
  // 可以通过window.$bus.$on()来监听应用的一些事件
  // 实例化页面
  if (window.initApp) {
    window.initApp()
  }
  
  // 发送就绪消息给父页面
  window.parent.postMessage({
    type: 'MINDMAP_READY'
  }, '*')
}
