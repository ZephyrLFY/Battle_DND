#include "connection.h"

Log::Log()
{
    createConnection();
    if (!db.open())
        QMessageBox::critical(0, qApp->tr("无法打开数据库"),qApp->tr("未能与数据库建立连接。"), QMessageBox::Cancel);
    initDatabase();
}

Log::~Log()
{}

void Log::createConnection()
{
    db = QSqlDatabase::addDatabase("QSQLITE");
    db.setDatabaseName("/Users/zephyr/mywork/dataBase.db");
}

bool Log::freeConnection()
{
    QSqlQuery query;
    query.prepare("update player set alive=? where ID = ?");
    query.addBindValue(0);
    query.addBindValue(name);
    query.exec();
    db.close();
    return true;
}

void Log::initDatabase()
{
    QSqlQuery query;
    query.exec("create table player (ID varchar primary key,password varchar,alive bool,ratio float,"
               "pokemon1 varchar(20),level1 int,"
               "pokemon2 varchar(20),level2 int,"
               "pokemon3 varchar(20),level3 int)");
    query.exec("insert into player values('test','test',0,1,'Charmander',15,'Pikachu',15,'Squirtle',15)");
}

QString Log::searchPwd(QString name)
{
    name = name;
    QString pwd;
    QSqlQuery query;
    query.exec(QString("select password from player where (ID = '%1')").arg(name));
    if(query.next())
        pwd = query.value(0).toString();
    else
        pwd = "NULL";
    return pwd;
}

bool Log::addNewusr(QString name,QString pwd)
{
    name = name;
    QSqlQuery query;
    query.exec(QString("select password from player where (ID = '%1')").arg(name));
    if(query.next())
        return false;
    else
    {
        query.last();
        query.prepare("insert into player (ID,password,alive)"
                         "values (?,?,?)");
        query.addBindValue(name);
        query.addBindValue(pwd);
        query.addBindValue(1);
        query.exec();
        return true;
    }
}

void Log::addPokemon(QString name)
{
    QSqlQuery query;
    query.prepare("update player set pokemon1=?,level1=? where ID = ?");
    query.addBindValue("Charmander");
    query.addBindValue(1);
    query.addBindValue(name);
    query.exec();
}
