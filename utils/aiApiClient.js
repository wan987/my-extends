/**
 * AI API调用工具
 * 用于与配置的大模型API进行交互
 */

//获取当前启用的API配置
async function getActiveApiConfig() {
  try {
    // 读取API配置
    const result = await chrome.storage.local.get('aiApiConfigV2');
    const config = result.aiApiConfigV2;

    if (!config) {
      console.warn('未找到API配置');
      return null;
    }

    // 检查总开关
    if (!config.enabled) {
      console.warn('智能标签功能总开关未开启');
      return null;
    }

    // 查找启用的API
    const activeApi = config.apis.find(api => api.enabled === true);

    if (!activeApi) {
      console.warn('未找到启用的API配置');
      return null;
    }

    return activeApi;
  } catch (error) {
    console.error('获取API配置失败:', error);
    return null;
  }
}

//解密API Key
function decryptApiKey(encryptedKey) {
  if (!encryptedKey) {
    return '';
  }

  // 如果已经解密，直接返回
  if (!encryptedKey.startsWith('ENCODED:')) {
    return encryptedKey;
  }

  try {
    // 移除ENCODED:前缀
    const encoded = encryptedKey.replace('ENCODED:', '');
    // Base64解码
    const decoded = atob(encoded);
    // URL解码
    const decrypted = decodeURIComponent(escape(decoded));
    return decrypted;
  } catch (error) {
    console.error('API Key解密失败:', error);
    // 解密失败时返回空字符串
    return '';
  }
}

//获取默认模型名称
function getDefaultModel(provider) {
  const defaultModels = {
    openai: 'gpt-3.5-turbo',
    claude: 'claude-3-haiku-20240307',
    deepseek: 'deepseek-chat',
    custom: 'default'
  };
  return defaultModels[provider] || 'default';
}

//构建API请求
function buildApiRequest(apiConfig, prompt) {
  const provider = apiConfig.provider || 'custom';
  const model = apiConfig.model || getDefaultModel(provider);
  const temperature = apiConfig.temperature !== undefined ? apiConfig.temperature : 0.7;
  const maxTokens = apiConfig.maxTokens !== undefined ? apiConfig.maxTokens : 500;
  const apiKey = decryptApiKey(apiConfig.apiKey);

  // 根据提供商类型构建不同的请求格式
  switch (provider) {
    case 'openai':
      return {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: {
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: temperature,
          max_tokens: maxTokens
        }
      };

    case 'claude':
      return {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: {
          model: model,
          max_tokens: maxTokens,
          temperature: temperature,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        }
      };

    case 'deepseek':
      // DeepSeek使用OpenAI兼容格式
      return {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: {
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: temperature,
          max_tokens: maxTokens
        }
      };

    default:
      // 自定义API使用通用格式
      return {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: {
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: temperature,
          max_tokens: maxTokens
        }
      };
  }
}

//解析API响应
function parseApiResponse(responseData, provider) {
  if (!responseData) {
    throw new Error('API响应为空');
  }

  // 检查是否有错误
  if (responseData.error) {
    throw new Error(responseData.error.message || 'API返回错误');
  }

  // 根据提供商类型解析响应
  switch (provider) {
    case 'openai':
    case 'deepseek':
    case 'custom':
      // OpenAI格式：response.choices[0].message.content
      if (responseData.choices && responseData.choices.length > 0) {
        const message = responseData.choices[0].message;
        if (message && message.content) {
          return message.content.trim();
        }
      }
      throw new Error('无法从API响应中提取内容');

    case 'claude':
      // Claude格式：response.content[0].text
      if (responseData.content && responseData.content.length > 0) {
        const textBlock = responseData.content[0];
        if (textBlock && textBlock.text) {
          return textBlock.text.trim();
        }
      }
      throw new Error('无法从API响应中提取内容');

    default:
      // 尝试通用解析
      if (responseData.choices && responseData.choices[0]?.message?.content) {
        return responseData.choices[0].message.content.trim();
      }
      if (responseData.content && responseData.content[0]?.text) {
        return responseData.content[0].text.trim();
      }
      if (responseData.text) {
        return responseData.text.trim();
      }
      throw new Error('无法从API响应中提取内容');
  }
}

//调用AI API
async function callAIApi(apiConfig, prompt) {
  if (!apiConfig) {
    throw new Error('API配置不能为空');
  }

  if (!prompt || !prompt.trim()) {
    throw new Error('提示文本不能为空');
  }

  // 解密API Key
  const apiKey = decryptApiKey(apiConfig.apiKey);
  if (!apiKey) {
    throw new Error('API Key无效或解密失败');
  }

  // 验证端点
  const endpoint = apiConfig.endpoint;
  if (!endpoint) {
    throw new Error('API端点不能为空');
  }

  try {
    // 构建请求
    const request = buildApiRequest(apiConfig, prompt);
    const timeout = apiConfig.timeout || 30000;

    // 发送请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // 检查HTTP状态
    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = '无法读取错误信息';
      }
      
      // 根据HTTP状态码提供更友好的错误信息
      let errorMessage = '';
      if (response.status === 401) {
        errorMessage = 'API Key无效或已过期，请检查API配置';
      } else if (response.status === 403) {
        errorMessage = 'API访问被拒绝，请检查API Key权限';
      } else if (response.status === 404) {
        errorMessage = 'API端点不存在，请检查端点URL是否正确';
      } else if (response.status === 429) {
        errorMessage = 'API请求频率过高，请稍后再试';
      } else if (response.status >= 500) {
        errorMessage = 'API服务器错误，请稍后再试';
      } else {
        errorMessage = `API请求失败 (${response.status})`;
      }
      
      // 尝试解析JSON错误信息
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          errorMessage += ': ' + errorJson.error.message;
        }
      } catch (e) {
        // 不是JSON格式，使用原始文本（截断）
        if (errorText && errorText.length > 0) {
          errorMessage += ': ' + errorText.substring(0, 100);
        }
      }
      
      throw new Error(errorMessage);
    }

    // 解析响应
    const responseData = await response.json();
    const content = parseApiResponse(responseData, apiConfig.provider);

    return content;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeout}ms），请检查网络连接或增加超时时间`);
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('网络请求失败，请检查网络连接和API端点是否正确');
    } else if (error.message) {
      // 保留原始错误信息
      throw error;
    } else {
      throw new Error('API调用失败：' + (error.toString() || '未知错误'));
    }
  }
}

// 在Chrome扩展环境中，导出函数到全局
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // 这些函数将在background service worker中使用
}
