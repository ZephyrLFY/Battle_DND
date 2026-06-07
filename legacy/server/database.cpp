#include "database.h"

Log::Log()
{
    createConnection();
    if (!db.open())
        QMessageBox::critical(nullptr, qApp->tr("无法打开数据库"),qApp->tr("未能与数据库建立连接。"), QMessageBox::Cancel);
    usrQuery = new QSqlQuery(db);
    pokeQuery = new QSqlQuery(db);
    //initDatabase();
    setOnlineOff();
}

Log::~Log()
{
    delete usrQuery;
    delete pokeQuery;
}

void Log::createConnection()//建立数据库连接
{
    db = QSqlDatabase::addDatabase("QSQLITE");
    db.setDatabaseName("/Users/zephyr/mywork/dataBase.db");
}

bool Log::freeConnection(QString name)//释放
{
    usrQuery->prepare("update player set alive=0 where ID = ?");
    usrQuery->addBindValue(name);
    usrQuery->exec();
    return true;
}

void Log::initDatabase()//初始化数据库
{
    usrQuery->exec("create table player (ID varchar primary key,password varchar,"
                "alive bool,win int,total int,number int,"
                "pokemon1 varchar(20),level1 int,exp1 int,"
                "pokemon2 varchar(20),level2 int,exp2 int,"
                "pokemon3 varchar(20),level3 int,exp3 int,"
                "pokemon4 varchar(20),level4 int,exp4 int,"
                "pokemon5 varchar(20),level5 int,exp5 int,"
                "pokemon6 varchar(20),level6 int,exp6 int,"
                "pokemon7 varchar(20),level7 int,exp7 int,"
                "end varchar(1))");
    usrQuery->exec("insert into player (ID,password,alive,win,total,number,pokemon1,level1,exp1,pokemon2,level2,exp2)"
                "values('test','123',0,50,100,2,'Onix',15,0,'Pidgeotto',13,3)");
    usrQuery->exec("insert into player (ID,password,alive,win,total,number,pokemon1,level1,exp1,pokemon2,level2,exp2)"
                "values('Zephyr','lifuyang',0,98,100,2,'Squirtle',15,0,'Muk',13,3)");
    usrQuery->exec("insert into player (ID,password,alive,win,total,number,pokemon1,level1,exp1,pokemon2,level2,exp2)"
                "values('god','777',0,17,30,2,'Licktung',2,0,'Krabby',7,5)");
    pokeQuery->exec("create table pokemon (ID varchar primary key,name varchar(20),"
                    "level qint32)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('1','Pikachu',1)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('2','Squirtle',1)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('3','Charmander',2)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('4','Hitmonlee',3)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('5','Pidgeotto',5)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('6','Shellder',5)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('7','Bulbasaur',7)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                    "values('8','Licktung',8)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                        "values('9','Onix',9)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                        "values('10','Pidgeotto',10)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                        "values('11','Muk',11)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                        "values('12','Krabby',13)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                        "values('13','Pidgeotto',13)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                        "values('14','Bulbasaur',15)");
    pokeQuery->exec("insert into pokemon (ID,name,level)"
                        "values('15','Pikachu',15)");
}

void Log::setOnlineOff()//强制下线
{
    usrQuery->exec("select alive from player");
    while(usrQuery->next())
    {
        usrQuery->prepare("update player set alive = ?");
        usrQuery->addBindValue(0);
        usrQuery->exec();
    }
}

QString Log::searchPwd(QString name)//密码搜索
{
    QString pwd;
    usrQuery->exec(QString("select password from player where (ID = '%1')").arg(name));
    if(usrQuery->next())
        pwd = usrQuery->value(0).toString();
    else
        pwd = "NULL";
    return pwd;
}

bool Log::aliveOrNot(QString name)//是否已在线
{
    /*是否已在线*/
    usrQuery->exec(QString("select alive from player where (ID = '%1')").arg(name));
    usrQuery->next();
    bool which = usrQuery->value(0).toBool();
    return which;
}

void Log::linkStart(QString name)
{
    /*建立连接*/
    usrQuery->prepare("update player set alive = ? where ID = ?");
    usrQuery->addBindValue(1);
    usrQuery->addBindValue(name);
    usrQuery->exec();
}

bool Log::addNewusr(QString name,QString pwd)
{
    /*新用户*/
    usrQuery->exec(QString("select password from player where (ID = '%1')").arg(name));
    if(usrQuery->next())
        return false;
    else
    {
        usrQuery->last();
        usrQuery->prepare("insert into player(ID,password,alive,win,total,number)"
                         "values (?,?,0,0,0,0)");
        usrQuery->addBindValue(name);
        usrQuery->addBindValue(pwd);
        usrQuery->exec();
        linkStart(name);
        return true;
    }
}

void Log::addPokemon(QString name)
{
    /*加精灵（测试）*/
    usrQuery->prepare("update player set pokemon1=?,level1=?,exp1=? where ID = ?");
    usrQuery->addBindValue("Charmander");
    usrQuery->addBindValue(1);
    usrQuery->addBindValue(0);
    usrQuery->addBindValue(name);
    usrQuery->exec();
    usrQuery->prepare("selcet number from player where ID = ?");
    usrQuery->addBindValue(name);
    usrQuery->exec();
    qint32 oldnum = usrQuery->value(0).toInt();
    oldnum++;
    usrQuery->prepare("update player set number = ? where ID = ?");
    usrQuery->addBindValue(oldnum);
    usrQuery->addBindValue(name);
    usrQuery->exec();
}

QList<QString>& Log::getUsr()
{
    /*获取用户信息*/
    usrQuery->exec("select * from player");
    QList<QString> *usr = new QList<QString>;
    qint32 i = 0;
    qint32 count = 0;
    for(usrQuery->first();usrQuery->seek(count);usrQuery->next())
    {
        while(usrQuery->value(i).toString() != "")
        {
            if(i == 1)
            {
                i++;
                continue;
            }
            usr->append(usrQuery->value(i).toString());
            i++;
        }
        i = 0;
        count++;
        usr->append("line");
    }
    usr->append("over");
    return *usr;
}

QList<QString>& Log::getPoke()
{
    /*虚拟精灵列表*/
    pokeQuery->exec("select * from pokemon");
    QList<QString> *poke = new QList<QString>;
    qint32 i = 0;
    qint32 count = 0;
    for(pokeQuery->first();pokeQuery->seek(count);pokeQuery->next())
    {
        while(pokeQuery->value(i).toString() != "")
        {
            if(i == 0)
            {
                i++;
                continue;
            }
            poke->append(pokeQuery->value(i).toString());
            i++;
        }
        i = 0;
        count++;
        poke->append("line");
    }
    poke->append("over");
    return *poke;
}

QList<QString>& Log::getUsrPoke(QString name)
{
    /*用户精灵*/
    usrQuery->exec(QString("select * from player where (ID = '%1')").arg(name));
    usrQuery->first();
    QList<QString> *poke = new QList<QString>;
    qint32 i = 6;
    qint32 count = 0;
    poke->append("1");
    poke->append(usrQuery->value(5).toString());
    while(!usrQuery->value(i).toString().isEmpty())
    {
        for(count = 0; count < 3; count++)
        {
            poke->append(usrQuery->value(i).toString());
            i++;
        }
        count = 0;
        poke->append("line");
    }
    poke->append("over");
    return *poke;
}

void Log::updateWinner(QString name,QString which,QString lvl,QString exp)
{
    /*胜者处理*/
    usrQuery->exec(QString("select * from player where (ID = '%1')").arg(name));
    usrQuery->next();
    int oldwin = usrQuery->value(3).toInt();
    oldwin++;
    int oldtotal = usrQuery->value(4).toInt();
    oldtotal++;
    usrQuery->prepare("update player set win = ?,total = ?,level"+which+"=?,exp"+which+"=? where ID = ?");
    usrQuery->addBindValue(oldwin);
    usrQuery->addBindValue(oldtotal);
    usrQuery->addBindValue(lvl.toInt());
    usrQuery->addBindValue(exp.toInt());
    usrQuery->addBindValue(name);
    usrQuery->exec();
}

void Log::updateLoser(QString name)
{
    /*败者处理*/
    usrQuery->exec(QString("select * from player where (ID = '%1')").arg(name));
    usrQuery->next();
    int oldtotal = usrQuery->value(4).toInt();
    oldtotal++;
    usrQuery->prepare("update player set total = ? where ID = ?");
    usrQuery->addBindValue(oldtotal);
    usrQuery->addBindValue(name);
    usrQuery->exec();
}

void Log::addNew(QString name,QString which,qint32 lvl,qint32 exp,QString index,bool flag)
{
    /*获得新精灵*/
    usrQuery->prepare("update player set pokemon"+index+"=?,level"+index+"=?,exp"+index+"=? where ID = ?");
    usrQuery->addBindValue(which);
    usrQuery->addBindValue(lvl);
    usrQuery->addBindValue(exp);
    usrQuery->addBindValue(name);
    usrQuery->exec();
    if(flag)
    {
        usrQuery->prepare("select * from player where ID = ?");
        usrQuery->addBindValue(name);
        usrQuery->exec();
        usrQuery->next();
        qint32 oldnum = usrQuery->value(5).toInt();
        oldnum++;
        usrQuery->prepare("update player set number = ? where ID = ?");
        usrQuery->addBindValue(oldnum);
        usrQuery->addBindValue(name);
        usrQuery->exec();
    }
}

void Log::dltOne(QString name,QString which,QString lvl,QString exp,QString index)
{
    /*删除新精灵*/
    usrQuery->prepare("update player set pokemon"+index+"=?,level"+index+"=?,exp"+index+"=? where ID = ?");
    usrQuery->addBindValue(which);
    usrQuery->addBindValue(lvl);
    usrQuery->addBindValue(exp);
    usrQuery->addBindValue(name);
    usrQuery->exec();
}

void Log::dltSum(QString name)
{
    /*用户精灵计数减1*/
    usrQuery->prepare("select * from player where ID = ?");
    usrQuery->addBindValue(name);
    usrQuery->exec();
    usrQuery->next();
    qint32 oldnum = usrQuery->value(5).toInt();
    oldnum--;
    usrQuery->prepare("update player set number = ? where ID = ?");
    usrQuery->addBindValue(oldnum);
    usrQuery->addBindValue(name);
    usrQuery->exec();
}
