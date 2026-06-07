#ifndef DATABASE_H
#define DATABASE_H

#include <QMessageBox>
#include <QSqlDatabase>
#include <QSqlQuery>
#include <QApplication>
#include <QList>
#include <QDebug>

class Log : public QObject
{
    Q_OBJECT
public:
    explicit Log();
    virtual ~Log();
    void initDatabase();//初始化数据库
    void setOnlineOff();//设置所有用户下线（防止服务器突然关闭）
    QString searchPwd(QString name);//查看密码
    bool addNewusr(QString name,QString pwd);//加入新用户
    void addPokemon(QString name);//加入精灵（用于测试）
    bool aliveOrNot(QString name);//看是否在线（判断能否上线）
    void linkStart(QString name);//用户链接
    QList<QString>& getUsr();//要用户信息
    QList<QString>& getPoke();//要虚拟对战精灵表
    QList<QString>& getUsrPoke(QString name);//要用户精灵
    void updateWinner(QString name,QString which,QString lvl,QString exp);//胜者结算
    void updateLoser(QString name);//败者结算
    void addNew(QString name,QString which,qint32 lvl,qint32 exp,QString index,bool flag);//获得新精灵
    void dltOne(QString name,QString which,QString lvl,QString exp,QString index);//删掉精灵
    void dltSum(QString name);//用户精灵数量减少
public slots:
    void createConnection();//建立数据库连接
    bool freeConnection(QString name);//释放数据库连接
private:
    QSqlDatabase db;
    QSqlQuery *usrQuery;
    QSqlQuery *pokeQuery;
};


#endif // DATABASE_H
